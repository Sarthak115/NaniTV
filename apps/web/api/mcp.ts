/**
 * NaniTV MCP server — "Ask Alexa about Nani".
 *
 * Model Context Protocol over Streamable HTTP (protocol 2025-11-25), stateless:
 * every POST builds a fresh McpServer + transport, so it runs as a plain Vercel
 * serverless function. The household is selected by its TV pair code, sent as the
 * `x-nani-household` header (or `?household=` for clients that can't set headers).
 *
 *   POST /api/mcp   JSON-RPC: initialize, tools/list, tools/call
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';

export const PROTOCOL_VERSION = '2025-11-25';
if (LATEST_PROTOCOL_VERSION !== PROTOCOL_VERSION) {
  console.warn(`[mcp] SDK latest protocol is ${LATEST_PROTOCOL_VERSION}, expected ${PROTOCOL_VERSION}`);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

// ---------------------------------------------------------------- helpers

type Db = SupabaseClient;

interface Household {
  id: string;
  pair_code: string;
  elder_name: string;
  language: 'hi' | 'en';
  checkin_deadline: string;
  timezone: string;
}

function tzParts(date: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date))
    p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
const todayIn = (tz: string) => {
  const p = tzParts(new Date(), tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
/** Instant when wall-clock `time` happens on `date` in `tz`. */
function zonedToDate(date: string, time: string, tz: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = tzParts(new Date(guess), tz);
  return new Date(guess - (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - guess));
}
const clock = (iso: string | Date, tz: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

/** Tool result helpers: text for the model, structured JSON for clients that use it. */
const ok = (summary: string, data: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
  structuredContent: data,
});
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

async function loadHousehold(db: Db, code: string | null): Promise<Household> {
  if (!code) {
    throw new UserError(
      'No household selected. Send the TV pair code in the "x-nani-household" header (or ?household=123456 on the URL).',
    );
  }
  const clean = code.replace(/\D/g, '');
  const { data, error } = await db.from('households').select('*').eq('pair_code', clean).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new UserError(`No NaniTV found with pair code ${clean}. Check the 6 digits on the TV's pairing screen.`);
  return data as Household;
}

class UserError extends Error {}

/** Wrap a tool handler: resolve the household, turn exceptions into friendly tool errors. */
function tool<A>(db: Db, code: string | null, fn: (h: Household, args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await fn(await loadHousehold(db, code), args);
    } catch (e) {
      console.error('[mcp] tool failed', e);
      return fail(e instanceof UserError ? e.message : `Sorry, NaniTV couldn't do that right now (${e instanceof Error ? e.message : e}).`);
    }
  };
}

async function invokeFunction(name: string, body: unknown, timeoutMs = 45000) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${name} returned ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- data

async function todayData(db: Db, h: Household) {
  const tz = h.timezone;
  const date = todayIn(tz);
  const start = zonedToDate(date, '00:00', tz).toISOString();
  const [checkins, reminders, events, messages, members, unread] = await Promise.all([
    db.from('checkins').select('kind, created_at').eq('household_id', h.id).gte('created_at', start).order('created_at'),
    db.from('reminders').select('id, title, times, active, created_at').eq('household_id', h.id),
    db.from('reminder_events').select('reminder_id, scheduled_for, status, acted_at').eq('household_id', h.id).gte('scheduled_for', start),
    db.from('messages').select('sender_id, type, text, created_at, seen_at, reaction').eq('household_id', h.id).gte('created_at', start).order('created_at'),
    db.from('members').select('id, name, relation').eq('household_id', h.id),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('household_id', h.id).is('seen_at', null),
  ]);
  const nameOf = (id: string | null) => members.data?.find((m) => m.id === id)?.name ?? 'Family';
  const now = Date.now();

  const medicines: { medicine: string; time: string; status: string; taken_at?: string }[] = [];
  for (const r of reminders.data ?? []) {
    if (!r.active) continue;
    for (const t of r.times as string[]) {
      const at = zonedToDate(date, t, tz);
      if (at.getTime() < new Date(r.created_at).getTime() - 60000) continue;
      const e = events.data?.find((x) => x.reminder_id === r.id && new Date(x.scheduled_for).getTime() === at.getTime());
      medicines.push({
        medicine: r.title,
        time: clock(at, tz),
        status: e?.status ?? (at.getTime() > now ? 'upcoming' : 'pending'),
        ...(e?.status === 'taken' && e.acted_at ? { taken_at: clock(e.acted_at, tz) } : {}),
      });
    }
  }
  // Missed events whose slot no longer exists (e.g. reminder paused) still matter.
  for (const e of events.data ?? []) {
    if (e.status !== 'missed') continue;
    const title = reminders.data?.find((r) => r.id === e.reminder_id)?.title ?? 'Medicine';
    const time = clock(e.scheduled_for, tz);
    if (!medicines.some((m) => m.medicine === title && m.time === time)) medicines.push({ medicine: title, time, status: 'missed' });
  }

  const ok_ = checkins.data?.find((c) => c.kind === 'ok');
  const helps = (checkins.data ?? []).filter((c) => c.kind === 'help');
  const deadline = zonedToDate(date, h.checkin_deadline, tz);

  return {
    elder: h.elder_name,
    date,
    timezone: tz,
    checked_in_ok: ok_ ? clock(ok_.created_at, tz) : null,
    checkin_deadline: clock(deadline, tz),
    no_checkin_past_deadline: !ok_ && now > deadline.getTime(),
    help_requests: helps.map((c) => clock(c.created_at, tz)),
    medicines,
    messages_today: (messages.data ?? []).map((m) => ({
      from: nameOf(m.sender_id),
      type: m.type,
      text: m.text ? String(m.text).slice(0, 140) : null,
      sent: clock(m.created_at, tz),
      seen_by_elder: !!m.seen_at,
      elder_reply: m.reaction ?? null,
    })),
    unread_messages_total: unread.count ?? 0,
  };
}

// ---------------------------------------------------------------- server

export function buildServer(code: string | null) {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const server = new McpServer(
    { name: 'nanitv', title: 'NaniTV', version: '1.0.0' },
    {
      instructions:
        "NaniTV connects an elderly parent's Fire TV with their family. Use these tools to check how the elder " +
        'is doing today, see alerts, send them a message (shown big on their TV and read aloud), add medicine ' +
        'reminders, or get an AI summary of their day. The elder is usually called "Nani".',
    },
  );

  server.registerTool(
    'get_today_status',
    {
      title: "Today's status",
      description:
        "How the elder is doing today: whether they pressed \"I'm OK\", each medicine dose (taken / missed / pending / upcoming), " +
        "help requests, today's family messages with whether they were seen and the elder's one-button reply, and the unread count.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tool(db, code, async (h) => {
      const d = await todayData(db, h);
      const taken = d.medicines.filter((m) => m.status === 'taken').length;
      return ok(
        `${d.elder} today: ${d.checked_in_ok ? `checked in OK at ${d.checked_in_ok}` : 'no "I\'m OK" yet'}; ` +
          `${taken}/${d.medicines.length} medicine doses taken; ${d.unread_messages_total} unread messages.`,
        d,
      );
    }),
  );

  server.registerTool(
    'get_alerts',
    {
      title: 'Alerts needing attention',
      description:
        'Things the family should act on today: "Need help" presses, missed medicines (not confirmed within 30 minutes), ' +
        '"Call me" replies to messages, and no "I\'m OK" check-in after the daily deadline. Empty list means all is well.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    tool(db, code, async (h) => {
      const d = await todayData(db, h);
      const alerts: { type: string; detail: string }[] = [];
      for (const t of d.help_requests) alerts.push({ type: 'help_request', detail: `${d.elder} pressed "Need help" at ${t}` });
      for (const m of d.medicines.filter((x) => x.status === 'missed'))
        alerts.push({ type: 'missed_medicine', detail: `${m.medicine} at ${m.time} was not taken` });
      for (const m of d.messages_today.filter((x) => x.elder_reply === 'call_me'))
        alerts.push({ type: 'call_me', detail: `${d.elder} asked ${m.from} to call (reply to the ${m.sent} message)` });
      if (d.no_checkin_past_deadline)
        alerts.push({ type: 'no_checkin', detail: `No "I'm OK" from ${d.elder} yet; expected by ${d.checkin_deadline}` });
      return ok(alerts.length ? `${alerts.length} alert(s) for ${d.elder}.` : `No alerts: ${d.elder} is all good today.`, {
        elder: d.elder,
        alerts,
      });
    }),
  );

  server.registerTool(
    'send_message_to_elder',
    {
      title: 'Send a message to the TV',
      description:
        "Send a text message to the elder's TV. It appears immediately with a chime, is rewritten by AI into short, warm words " +
        'in their language (Hindi or English), and is read aloud. Write it as the family member would say it.',
      inputSchema: {
        text: z.string().trim().min(1, 'Message is empty').max(500, 'Keep it under 500 characters').describe('The message, e.g. "I will call you at 7 tonight"'),
        from_name: z.string().trim().min(1).max(30).describe('Who it is from, e.g. "Riya". Matches a family member already on the TV if possible.'),
      },
    },
    tool(db, code, async (h, { text, from_name }: { text: string; from_name: string }) => {
      const { data: found } = await db.from('members').select('id, name').eq('household_id', h.id).ilike('name', from_name).limit(1);
      let sender = found?.[0];
      if (!sender) {
        const { data, error } = await db
          .from('members')
          .insert({ household_id: h.id, name: from_name, relation: 'via assistant' })
          .select('id, name')
          .single();
        if (error) throw new Error(error.message);
        sender = data;
      }
      const { data: msg, error } = await db
        .from('messages')
        .insert({ household_id: h.id, sender_id: sender!.id, type: 'text', text })
        .select('id, created_at')
        .single();
      if (error) throw new Error(error.message);
      // Rewrite for the elder after responding (Gemini can take 10s+); the TV already shows the raw text.
      waitUntil(invokeFunction('simplify-message', { message_id: msg.id }).catch((e) => console.error('[mcp] simplify', e)));
      return ok(`Sent to ${h.elder_name}'s TV from ${sender!.name}. It is on screen now and will be read aloud in simple ${h.language === 'hi' ? 'Hindi' : 'English'}.`, {
        sent: true,
        message_id: msg.id,
        to: h.elder_name,
        from: sender!.name,
      });
    }),
  );

  server.registerTool(
    'add_reminder',
    {
      title: 'Add a medicine reminder',
      description:
        "Create a daily medicine reminder. At each time the elder's TV shows a full-screen reminder with a chime and a single " +
        '"Taken" button; if it is not confirmed within 30 minutes the family gets a missed-dose alert. Times are 24-hour HH:MM ' +
        "in the elder's timezone (India by default).",
      inputSchema: {
        title: z.string().trim().min(1).max(40).describe('Medicine name, e.g. "BP tablet"'),
        times: z
          .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 09:00 or 21:30'))
          .min(1, 'Give at least one time')
          .max(6)
          .describe('Daily times, 24-hour HH:MM, e.g. ["09:00", "21:00"]'),
      },
    },
    tool(db, code, async (h, { title, times }: { title: string; times: string[] }) => {
      const sorted = [...new Set(times)].sort();
      const { data, error } = await db.from('reminders').insert({ household_id: h.id, title, times: sorted }).select('id').single();
      if (error) throw new Error(error.message);
      const pretty = sorted.map((t) => clock(zonedToDate(todayIn(h.timezone), t, h.timezone), h.timezone));
      return ok(`Added "${title}" for ${h.elder_name} at ${pretty.join(' and ')} every day.`, {
        reminder_id: data.id,
        title,
        times: sorted,
        timezone: h.timezone,
      });
    }),
  );

  server.registerTool(
    'get_daily_digest',
    {
      title: "AI summary of the elder's day",
      description:
        "A short, friendly AI summary (3-5 lines) of the elder's day for the family, leading with anything that needs attention. " +
        'Takes up to ~20 seconds. Optionally pass a date (YYYY-MM-DD); defaults to today.',
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().describe('Day to summarise, YYYY-MM-DD'),
      },
      annotations: { readOnlyHint: true },
    },
    tool(db, code, async (h, { date }: { date?: string }) => {
      const r = await invokeFunction('daily-digest', { household_id: h.id, date: date ?? todayIn(h.timezone) });
      return ok(String(r.summary ?? 'No summary available.'), { date: r.date, summary: r.summary, ai: r.ai });
    }),
  );

  return server;
}

// ---------------------------------------------------------------- HTTP handler

type Req = IncomingMessage & { body?: unknown };

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, x-nani-household',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: ServerResponse) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    // Stateless server: no standalone SSE stream (GET) and no sessions to DELETE.
    sendJson(res, 405, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. NaniTV MCP is stateless: POST JSON-RPC to /api/mcp.' },
      id: null,
    });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Server is missing Supabase configuration' }, id: null });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const header = req.headers['x-nani-household'];
  const code = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get('household');

  const server = buildServer(code ?? null);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('[mcp] request failed', e);
    if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  }
}
