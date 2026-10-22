// Rewrites a family message into short, warm, simple language in the elder's
// language. Saves simplified_text (+ a romanised tts_text for TVs without a
// Hindi voice). On any Gemini failure it falls back to the original text.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/cors.ts';
import { generate, lastModelUsed } from '../_shared/gemini.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let messageId: string | undefined;
  try {
    ({ message_id: messageId } = await req.json());
  } catch {
    /* fallthrough */
  }
  if (!messageId) return json({ error: 'message_id required' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  console.log('simplify', messageId);
  const { data: msg, error } = await db.from('messages').select('*').eq('id', messageId).maybeSingle();
  console.log('loaded message', !!msg, error?.message ?? '');
  if (error || !msg) return json({ error: 'message not found' }, 404);
  if (!msg.text?.trim()) return json({ simplified_text: null });

  const [{ data: sender }, { data: household }] = await Promise.all([
    msg.sender_id
      ? db.from('members').select('name, relation').eq('id', msg.sender_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('households').select('elder_name, language').eq('id', msg.household_id).maybeSingle(),
  ]);

  const senderName = sender?.name ?? 'Family';
  const hindi = (household?.language ?? 'hi') === 'hi';
  const elder = household?.elder_name ?? 'Nani';
  const kind = msg.type === 'photo' ? 'a photo caption' : 'a message';

  const prompt = `You are helping an elderly grandmother (${elder}) read ${kind} from her family on a TV.
Rewrite it for her in ${hindi ? 'Hindi in Devanagari script' : 'simple English'}.
Max 2 short sentences, warm and respectful, start with who sent it (e.g. "${hindi ? `${senderName} ने भेजा:` : `${senderName} says:`}").
No emojis except at most one heart.
Sender: ${senderName}${sender?.relation ? ` (${elder}'s ${sender.relation})` : ''}
Message: "${msg.text.replace(/"/g, "'")}"

Return JSON: {"text": "<the rewritten message>", "tts": "<the same rewritten message ${hindi ? 'transliterated into simple Latin-script Hinglish (e.g. \\"Riya ne bheja: ...\\") so an English voice can read it aloud' : 'with emojis removed'}>"}`;

  let simplified = msg.text as string;
  let tts = msg.text as string;
  let usedAi = false;
  let aiError: string | undefined;
  try {
    const out = JSON.parse(await generate(prompt, { json: true }));
    if (typeof out.text === 'string' && out.text.trim()) {
      simplified = out.text.trim();
      tts = typeof out.tts === 'string' && out.tts.trim() ? out.tts.trim() : simplified;
      usedAi = true;
    }
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
    console.error('simplify failed, using original text:', aiError);
    simplified = `${senderName}: ${msg.text}`;
    tts = simplified;
  }

  const { error: saveErr } = await db.from('messages').update({ simplified_text: simplified, tts_text: tts }).eq('id', messageId);
  console.log('saved', usedAi ? 'ai' : 'fallback', saveErr?.message ?? '');
  return json({
    simplified_text: simplified,
    tts_text: tts,
    ai: usedAi,
    model: lastModelUsed(),
    ...(aiError ? { ai_error: aiError } : {}),
  });
});
