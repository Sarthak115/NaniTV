/**
 * The agent loop behind /assistant: Gemini (server-side, via the `assistant-chat` edge
 * function) picks tools from the MCP server's tool list; this loop executes them over MCP
 * and feeds results back until Gemini answers in plain speech.
 */
import { McpHttpClient, toolResultText, type McpTool } from './mcpClient';

/** A Gemini `Content` turn, kept verbatim (incl. thought signatures) between calls. */
export interface Turn {
  role: 'user' | 'model';
  parts: Record<string, any>[];
}

export interface AssistantStep {
  kind: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'error';
  text: string;
  detail?: unknown;
  ms?: number;
}

export interface AssistantConfig {
  supabaseUrl: string;
  anonKey: string;
  elderName: string;
  familyName?: string;
}

const MAX_ROUNDS = 5;

/** The Gemini model that answered last; sent as a hint so later turns skip slow fallbacks. */
let modelHint: string | undefined;

async function chat(cfg: AssistantConfig, contents: Turn[], tools: McpTool[]) {
  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/assistant-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    body: JSON.stringify({
      contents,
      tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      elder_name: cfg.elderName,
      family_name: cfg.familyName,
      now: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }),
      model_hint: modelHint,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.content) throw new Error(body.error ?? `assistant-chat HTTP ${res.status}`);
  modelHint = body.model;
  return body as { content: Turn; model: string };
}

/**
 * Answer one question. `history` is the conversation so far (mutated: new turns are appended).
 * Returns the spoken answer.
 */
export async function ask(
  question: string,
  history: Turn[],
  mcp: McpHttpClient,
  tools: McpTool[],
  cfg: AssistantConfig,
  onStep: (s: AssistantStep) => void,
): Promise<string> {
  history.push({ role: 'user', parts: [{ text: question }] });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const t0 = performance.now();
    onStep({ kind: 'thinking', text: round === 0 ? 'Gemini is choosing tools…' : 'Gemini is reading the results…' });
    const { content, model } = await chat(cfg, history, tools);
    history.push({ role: 'model', parts: content.parts ?? [] });

    const calls = (content.parts ?? []).filter((p) => p.functionCall);
    if (!calls.length) {
      const answer = (content.parts ?? [])
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join(' ')
        .trim();
      onStep({ kind: 'answer', text: answer || 'Done.', detail: { model }, ms: Math.round(performance.now() - t0) });
      return answer || 'Done.';
    }

    const responses: Record<string, any>[] = [];
    for (const { functionCall } of calls) {
      const args = functionCall.args ?? {};
      onStep({ kind: 'tool_call', text: functionCall.name, detail: args });
      const c0 = performance.now();
      try {
        const result = await mcp.callTool(functionCall.name, args);
        const text = toolResultText(result);
        onStep({
          kind: 'tool_result',
          text: `${functionCall.name}${result.isError ? ' (error)' : ''}`,
          detail: result.structuredContent ?? text,
          ms: Math.round(performance.now() - c0),
        });
        responses.push({
          functionResponse: {
            ...(functionCall.id ? { id: functionCall.id } : {}),
            name: functionCall.name,
            response: result.isError ? { error: text } : { result: result.structuredContent ?? text },
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        onStep({ kind: 'error', text: `${functionCall.name} failed: ${message}` });
        responses.push({ functionResponse: { name: functionCall.name, response: { error: message } } });
      }
    }
    history.push({ role: 'user', parts: responses });
  }
  const fallback = "Sorry, that took too many steps. Please try asking a simpler way.";
  onStep({ kind: 'answer', text: fallback });
  return fallback;
}
