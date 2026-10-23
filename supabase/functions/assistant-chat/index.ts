// The "brain" of the /assistant page. The browser is the MCP client: it fetches the
// tool list from the NaniTV MCP server (tools/list) and passes it here; Gemini decides
// which tools to call (function calling). The browser then runs those calls over MCP
// (tools/call) and sends the results back, until Gemini answers in plain speech.
// The Gemini key never leaves this function.
import { corsHeaders, json } from '../_shared/cors.ts';
import { callGemini, lastModelUsed } from '../_shared/gemini.ts';

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Gemini's parametersJsonSchema takes plain JSON Schema; drop meta keys it doesn't need. */
function cleanSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === '$schema' || k === '$id') continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: {
    contents?: unknown[];
    tools?: McpTool[];
    elder_name?: string;
    family_name?: string;
    now?: string;
    /** Model that answered last time; tried first so a session doesn't re-pay fallback latency. */
    model_hint?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const contents = (body.contents ?? []).slice(-24);
  if (!contents.length) return json({ error: 'contents required' }, 400);
  const elder = body.elder_name || 'Nani';

  const system = `You are a friendly voice assistant (like Alexa) for a family who use NaniTV to look after ${elder}, an elderly family member who uses a Fire TV.
The person talking to you is ${body.family_name ? `${body.family_name}, one of ${elder}'s family` : `one of ${elder}'s family`}. Current local time: ${body.now ?? 'unknown'}.
Use the tools to answer questions about how ${elder} is doing, alerts, medicines, and to send ${elder} messages or add reminders. Always call a tool rather than guessing.
When sending a message, write it in first person as the family member would say it, and use their name as from_name.
For reminder times convert spoken times to 24-hour HH:MM (e.g. "8 pm" -> "20:00").
Your reply is spoken aloud: 1-3 short, warm sentences, no markdown, no lists, no emojis. Lead with anything that needs attention (help requests, missed medicine, "call me").`;

  const request = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: body.tools?.length
      ? [
          {
            functionDeclarations: body.tools.map((t) => ({
              name: t.name,
              description: t.description ?? '',
              parametersJsonSchema: cleanSchema(t.inputSchema ?? { type: 'object', properties: {} }),
            })),
          },
        ]
      : undefined,
    generationConfig: { temperature: 0.3 },
  };

  try {
    const hint = typeof body.model_hint === 'string' && /^gemini-[\w.-]+$/.test(body.model_hint) ? body.model_hint : undefined;
    const { body: res, model } = await callGemini(request, { prefer: hint });
    const candidate = res.candidates?.[0];
    if (!candidate?.content) {
      return json({ error: `No answer (${candidate?.finishReason ?? 'empty'})`, model }, 502);
    }
    // Return the model turn verbatim (incl. thought signatures) so the client can echo it back.
    return json({ content: candidate.content, finishReason: candidate.finishReason, model });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('assistant-chat failed', message);
    return json({ error: message, model: lastModelUsed() }, 502);
  }
});
