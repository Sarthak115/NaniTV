// Shared Gemini REST helper for Edge Functions.
// The configured GEMINI_MODEL is tried first; if it is missing, overloaded (503/429)
// or too slow, other current Flash models from ListModels are tried within a time
// budget. The model that worked is cached for this warm instance.

const API = 'https://generativelanguage.googleapis.com/v1beta';

let resolvedModel: string | null = null;
const recentFailures = new Map<string, number>();
const BREAKER_MS = 5 * 60 * 1000;
let lastModel = '';
export const lastModelUsed = () => lastModel;

function cleanModel(name: string) {
  return name.replace(/^models\//, '').trim();
}

/** Current Flash models for this key, best first. */
async function listFlashModels(key: string, limit = 4): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(6000),
    });
  } catch (e) {
    console.error('ListModels failed', e);
    return [];
  }
  if (!res.ok) {
    console.error('ListModels failed', res.status, await res.text());
    return [];
  }
  const body = await res.json();
  const models: { name: string; supportedGenerationMethods?: string[] }[] = body.models ?? [];
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => cleanModel(m.name))
    .filter((n) => n.includes('flash') && !/(image|tts|audio|live|embedding|thinking-exp)/.test(n));
  // Prefer stable names (no "preview"/"exp"), then the highest version number.
  const score = (n: string) =>
    (/(preview|exp)/.test(n) ? 0 : 1000) +
    parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) ?? [])[1] ?? '0') * 10 -
    (n.includes('lite') ? 1 : 0);
  usable.sort((a, b) => score(b) - score(a));
  console.log('Available flash models:', usable.join(', '));
  return usable.slice(0, limit);
}

/** Keep latency low: these are tiny rewriting tasks that don't need long reasoning. */
function thinkingFor(model: string): Record<string, unknown> | undefined {
  const v = parseFloat((model.match(/gemini-(\d+(\.\d+)?)/) ?? [])[1] ?? '0');
  if (v >= 3) return { thinkingLevel: 'low' };
  if (v >= 2.5) return { thinkingBudget: 0 };
  return undefined;
}

/** A generateContent request body (contents, tools, systemInstruction, generationConfig…). */
export type GeminiRequest = Record<string, unknown> & { generationConfig?: Record<string, unknown> };

async function callModel(model: string, key: string, request: GeminiRequest, thinking: boolean, timeoutMs: number) {
  const thinkingConfig = thinking ? thinkingFor(model) : undefined;
  console.log(`Gemini call: ${model}`, thinkingConfig ?? '');
  return fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    // The demo must never hang: give up and let the caller fall back.
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      ...request,
      generationConfig: {
        temperature: 0.4,
        ...request.generationConfig,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    }),
  });
}

/** One attempt on one model. Returns the response, or an error string. */
async function attempt(model: string, key: string, request: GeminiRequest, timeoutMs: number) {
  try {
    let res = await callModel(model, key, request, true, timeoutMs);
    // 400 may just mean this model doesn't accept our thinkingConfig: retry plain.
    if (res.status === 400 && thinkingFor(model)) {
      console.warn(`400 with thinkingConfig on ${model}: ${(await res.text()).slice(0, 200)}`);
      res = await callModel(model, key, request, false, timeoutMs);
    }
    if (res.ok) return { res };
    return { error: `Gemini ${res.status} on ${model}: ${(await res.text()).slice(0, 200)}` };
  } catch (e) {
    return { error: `${model}: ${e instanceof Error ? e.message : e}` };
  }
}

/** Returns the model's text output, or throws. */
export async function generate(prompt: string, opts: { json?: boolean } = {}): Promise<string> {
  const started = Date.now();
  const { body, model } = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: opts.json ? { responseMimeType: 'application/json' } : {},
  });
  return readText(body, model, started);
}

/**
 * Runs a raw generateContent request and returns the parsed response body. Tries the
 * configured model, then other Flash models from ListModels when it is missing (404),
 * overloaded (503/429) or slow.
 */
export async function callGemini(
  request: GeminiRequest,
  opts: { budgetMs?: number; prefer?: string } = {},
): Promise<{ body: any; model: string }> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 28000;

  const configured = cleanModel(Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash');
  const prefer = opts.prefer ? cleanModel(opts.prefer) : null;
  // Known-good first (caller's hint, then what worked on this instance), then the configured model.
  const queue = [...new Set([prefer, resolvedModel, configured].filter((m): m is string => !!m))];
  // Circuit breaker: skip models that failed recently on this instance (unless nothing else is left).
  const healthy = queue.filter((m) => !(recentFailures.get(m)! > Date.now() - BREAKER_MS));
  if (healthy.length) queue.splice(0, queue.length, ...healthy);
  let listed = false;
  const errors: string[] = [];

  while (queue.length) {
    const left = budgetMs - (Date.now() - started);
    if (left < 2000) break;
    const model = queue.shift()!;
    lastModel = model;
    // A model that hasn't proven itself gets a short leash; healthy calls take ~2-5s.
    const knownGood = model === prefer || model === resolvedModel;
    const r = await attempt(model, key, request, Math.min(knownGood ? 15000 : 6000, left));
    if (r.res) {
      resolvedModel = model;
      recentFailures.delete(model);
      console.log(`Gemini ok via ${model} in ${Date.now() - started}ms`);
      return { body: await r.res.json(), model };
    }
    console.warn(r.error);
    errors.push(r.error!);
    recentFailures.set(model, Date.now());
    if (!listed) {
      listed = true;
      for (const m of await listFlashModels(key, 6)) {
        if (queue.includes(m) || m === model || recentFailures.get(m)! > Date.now() - BREAKER_MS) continue;
        queue.push(m);
      }
    }
  }
  throw new Error(errors.join(' | ').slice(0, 500) || 'Gemini unavailable');
}

function readText(body: any, model: string, started: number) {
  const text: string = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text.trim()) throw new Error(`Gemini returned empty text (${model})`);
  console.log(`Gemini text via ${model} in ${Date.now() - started}ms`);
  return text.trim();
}
