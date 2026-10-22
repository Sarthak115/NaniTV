// Summarises the elder's day for the family in 3–5 friendly lines.
// Falls back to a template summary if Gemini is unavailable, so the button always works.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/cors.ts';
import { generate, lastModelUsed } from '../_shared/gemini.ts';

/** UTC instant of local midnight for `date` in `tz` (mirrors apps/web/src/lib/time.ts). */
function zonedMidnight(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(guess))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(guess - (asUtc - guess));
}

const clock = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { household_id?: string; date?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fallthrough */
  }
  if (!body.household_id) return json({ error: 'household_id required' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: household } = await db.from('households').select('*').eq('id', body.household_id).maybeSingle();
  if (!household) return json({ error: 'household not found' }, 404);

  const tz: string = household.timezone ?? 'Asia/Kolkata';
  const date = body.date ?? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const from = zonedMidnight(date, tz);
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  const range = (q: any, col: string) => q.gte(col, from.toISOString()).lt(col, to.toISOString());

  const [members, checkins, events, reminders, messages] = await Promise.all([
    db.from('members').select('id, name, relation').eq('household_id', household.id),
    range(db.from('checkins').select('kind, created_at').eq('household_id', household.id), 'created_at'),
    range(db.from('reminder_events').select('reminder_id, scheduled_for, status, acted_at').eq('household_id', household.id), 'scheduled_for'),
    db.from('reminders').select('id, title').eq('household_id', household.id),
    range(
      db.from('messages').select('sender_id, type, text, created_at, seen_at, reaction').eq('household_id', household.id),
      'created_at',
    ),
  ]);

  const nameOf = (id: string | null) => members.data?.find((m: any) => m.id === id)?.name ?? 'Family';
  const titleOf = (id: string) => reminders.data?.find((r: any) => r.id === id)?.title ?? 'Medicine';
  const elder: string = household.elder_name;

  const day = {
    elder,
    date,
    checkins: (checkins.data ?? []).map((c: any) => ({ kind: c.kind, at: clock(c.created_at, tz) })),
    medicines: (events.data ?? []).map((e: any) => ({
      medicine: titleOf(e.reminder_id),
      scheduled: clock(e.scheduled_for, tz),
      status: e.status,
      taken_at: e.acted_at && e.status === 'taken' ? clock(e.acted_at, tz) : null,
    })),
    messages: (messages.data ?? []).map((m: any) => ({
      from: nameOf(m.sender_id),
      type: m.type,
      text: m.text ? String(m.text).slice(0, 120) : null,
      sent: clock(m.created_at, tz),
      seen_by_elder: !!m.seen_at,
      elder_reply: m.reaction, // got_it | love | call_me | null
    })),
  };

  const prompt = `Summarise this elderly parent's day for her family in English, 3-5 short friendly lines.
Lead with anything needing attention (missed medicine, help request, "call me" reply, no "I'm OK" check-in). Then positives.
Use her family name "${elder}". Plain text lines only, no markdown, no bullet symbols, at most one emoji per line.
If there is little data, say so kindly in 2 lines.
Data: ${JSON.stringify(day)}`;

  let summary: string;
  let ai = false;
  let aiError: string | undefined;
  try {
    summary = (await generate(prompt))
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .join('\n');
    ai = true;
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
    console.error('digest AI failed, using template:', aiError);
    summary = templateDigest(day);
  }

  await db.from('digests').upsert({ household_id: household.id, for_date: date, summary }, { onConflict: 'household_id,for_date' });
  return json({ summary, date, ai, model: lastModelUsed(), ...(aiError ? { ai_error: aiError } : {}) });
});

function templateDigest(day: any): string {
  const lines: string[] = [];
  const help = day.checkins.filter((c: any) => c.kind === 'help');
  const ok = day.checkins.find((c: any) => c.kind === 'ok');
  const missed = day.medicines.filter((m: any) => m.status === 'missed');
  const taken = day.medicines.filter((m: any) => m.status === 'taken');
  const calls = day.messages.filter((m: any) => m.elder_reply === 'call_me');
  if (help.length) lines.push(`🆘 ${day.elder} asked for help at ${help[help.length - 1].at}.`);
  if (missed.length) lines.push(`💊 Missed: ${missed.map((m: any) => `${m.medicine} (${m.scheduled})`).join(', ')}.`);
  if (calls.length) lines.push(`📞 ${day.elder} asked ${calls.map((c: any) => c.from).join(', ')} to call.`);
  lines.push(ok ? `✅ ${day.elder} checked in "I'm OK" at ${ok.at}.` : `⌛ No "I'm OK" check-in yet today.`);
  if (taken.length) lines.push(`💊 Took ${taken.map((m: any) => m.medicine).join(', ')} on time.`);
  const seen = day.messages.filter((m: any) => m.seen_by_elder).length;
  if (day.messages.length) lines.push(`💌 Saw ${seen} of ${day.messages.length} family messages.`);
  return lines.slice(0, 5).join('\n');
}
