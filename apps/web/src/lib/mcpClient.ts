/**
 * A minimal, real MCP client over Streamable HTTP (protocol 2025-11-25), using only fetch.
 * Every JSON-RPC message is reported to `onLog` so the UI can show what goes over the wire.
 */

export const MCP_PROTOCOL_VERSION = '2025-11-25';

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface RpcLogEntry {
  id: number;
  method: string;
  request: unknown;
  response?: unknown;
  status?: number;
  ms?: number;
  error?: string;
}

type JsonRpcResponse = { jsonrpc: '2.0'; id: number; result?: any; error?: { code: number; message: string } };

export class McpHttpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private negotiated: string | null = null;
  serverInfo: { name: string; title?: string; version: string } | null = null;
  instructions: string | null = null;

  constructor(
    private url: string,
    private headers: Record<string, string> = {},
    private onLog?: (entry: RpcLogEntry) => void,
  ) {}

  get protocolVersion() {
    return this.negotiated;
  }

  /** initialize → notifications/initialized */
  async connect() {
    const result = await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'nanitv-assistant', title: 'Ask Alexa about Nani (web)', version: '1.0.0' },
    });
    this.negotiated = result.protocolVersion;
    this.serverInfo = result.serverInfo;
    this.instructions = result.instructions ?? null;
    await this.notify('notifications/initialized');
    return result;
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const r = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...r.tools);
      cursor = r.nextCursor;
    } while (cursor);
    return tools;
  }

  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.request('tools/call', { name, arguments: args });
  }

  private baseHeaders() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.negotiated ? { 'MCP-Protocol-Version': this.negotiated } : {}),
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.headers,
    };
  }

  private async notify(method: string, params?: unknown) {
    const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
    const t0 = performance.now();
    const res = await fetch(this.url, { method: 'POST', headers: this.baseHeaders(), body: JSON.stringify(msg) });
    this.onLog?.({ id: 0, method, request: msg, status: res.status, ms: Math.round(performance.now() - t0) });
  }

  private async request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    const t0 = performance.now();
    const log: RpcLogEntry = { id, method, request: msg };
    try {
      const res = await fetch(this.url, { method: 'POST', headers: this.baseHeaders(), body: JSON.stringify(msg) });
      log.status = res.status;
      const sid = res.headers.get('Mcp-Session-Id');
      if (sid) this.sessionId = sid;
      const body = await this.readResponse(res, id);
      log.response = body;
      log.ms = Math.round(performance.now() - t0);
      this.onLog?.(log);
      if (!body) throw new Error(`HTTP ${res.status}`);
      if (body.error) throw new Error(body.error.message);
      return body.result;
    } catch (e) {
      log.error = e instanceof Error ? e.message : String(e);
      log.ms = Math.round(performance.now() - t0);
      if (!log.response) this.onLog?.(log);
      throw e;
    }
  }

  /** Streamable HTTP servers may answer with JSON or with an SSE stream carrying the response. */
  private async readResponse(res: Response, id: number): Promise<JsonRpcResponse | null> {
    const type = res.headers.get('Content-Type') ?? '';
    const text = await res.text();
    if (!text) return null;
    if (type.includes('text/event-stream')) {
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        const msg = JSON.parse(data);
        if (msg.id === id) return msg;
      }
      return null;
    }
    return JSON.parse(text);
  }
}

/** Plain text of a tool result, for the model and the transcript. */
export const toolResultText = (r: McpToolResult) =>
  r.content
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();
