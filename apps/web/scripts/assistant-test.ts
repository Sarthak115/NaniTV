// End-to-end test of the assistant loop from Node: real MCP client → MCP server → Gemini.
//   npx tsx scripts/assistant-test.ts "How is Nani today?" [mcpUrl] [householdCode]
import { readFileSync } from 'node:fs';
import { McpHttpClient } from '../src/lib/mcpClient.ts';
import { ask, type Turn } from '../src/lib/assistant.ts';

const env: Record<string, string> = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const [question = 'How is Nani today?', url = 'http://localhost:3333/api/mcp', code = '301931'] = process.argv.slice(2);
const mcp = new McpHttpClient(url, { 'x-nani-household': code }, (e) =>
  console.log(`  ⇄ ${e.method}${e.status ? ` [${e.status}]` : ''}${e.ms != null ? ` ${e.ms}ms` : ''}${e.error ? ` ERROR ${e.error}` : ''}`),
);

await mcp.connect();
console.log('protocol:', mcp.protocolVersion, 'server:', mcp.serverInfo?.name);
const tools = await mcp.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const history: Turn[] = [];
const answer = await ask(question, history, mcp, tools, { supabaseUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, elderName: 'Nani', familyName: 'Riya' }, (s) =>
  console.log(
    `  • ${s.kind}: ${s.text}${s.detail && (s.kind === 'tool_call' || s.kind === 'answer') ? ' ' + JSON.stringify(s.detail) : ''}${s.ms ? ` (${s.ms}ms)` : ''}`,
  ),
);
console.log('\nANSWER:', answer);
