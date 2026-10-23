// Run the Vercel MCP function locally: `npm run mcp:local` → http://localhost:3333/api/mcp
// Reads Supabase settings from apps/web/.env (same as Vite).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { default: handler } = await import('../api/mcp.ts');
const port = Number(process.env.PORT ?? 3333);

createServer(async (req, res) => {
  if (!req.url?.startsWith('/api/mcp')) {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  for await (const c of req) raw += String(c);
  // Vercel parses JSON bodies before calling the function; mirror that.
  (req as typeof req & { body?: unknown }).body = raw ? JSON.parse(raw) : undefined;
  await handler(req, res);
}).listen(port, () => console.log(`NaniTV MCP (local) on http://localhost:${port}/api/mcp`));
