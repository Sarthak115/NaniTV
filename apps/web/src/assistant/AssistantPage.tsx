import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { McpHttpClient, type McpTool, type RpcLogEntry } from '../lib/mcpClient';
import { ask, type AssistantStep, type Turn } from '../lib/assistant';
import { getFamilySession } from '../lib/household';
import { supabase } from '../lib/supabase';
import './assistant.css';

const CODE_KEY = 'nanitv.assistant.code';
const MCP_URL = '/api/mcp';
const EXAMPLES = [
  'How is Nani today?',
  'Any alerts?',
  "Tell Nani I'll call her at 7 tonight",
  'Remind Nani to take her vitamin at 8 pm',
  "Summarise Nani's day",
];

interface Exchange {
  id: number;
  question: string;
  steps: AssistantStep[];
  answer?: string;
  error?: string;
}

// Web Speech API (Chrome/Android; webkit-prefixed). Typed loosely: it isn't in lib.dom.
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};
const SpeechRecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function speakAnswer(text: string) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export default function AssistantPage() {
  // `/assistant?code=123456` selects the TV directly (handy as a demo link / QR).
  const [code, setCode] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code')?.replace(/\D/g, '');
    if (fromUrl?.length === 6) {
      safeSet(CODE_KEY, fromUrl);
      return fromUrl;
    }
    return safeGet(CODE_KEY) ?? '';
  });
  const [codeInput, setCodeInput] = useState('');
  const [elder, setElder] = useState('Nani');
  const [familyName, setFamilyName] = useState<string | undefined>();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [connectError, setConnectError] = useState('');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [log, setLog] = useState<RpcLogEntry[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [text, setText] = useState('');
  const mcp = useRef<McpHttpClient | null>(null);
  const history = useRef<Turn[]>([]);
  const recog = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Dark page background only while this page is mounted.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#0b1220';
    document.body.style.margin = '0';
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  // Use the family session's household if this phone already joined a TV.
  useEffect(() => {
    if (code) return;
    const s = getFamilySession();
    if (!s || !supabase) return;
    supabase
      .from('households')
      .select('pair_code, elder_name')
      .eq('id', s.household_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCode(data.pair_code);
          safeSet(CODE_KEY, data.pair_code);
        }
      });
    supabase
      .from('members')
      .select('name')
      .eq('id', s.member_id)
      .maybeSingle()
      .then(({ data }) => data && setFamilyName(data.name));
  }, [code]);

  // MCP handshake: initialize → notifications/initialized → tools/list.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    setStatus('connecting');
    setLog([]);
    history.current = [];
    const client = new McpHttpClient(MCP_URL, { 'x-nani-household': code }, (e) => alive && setLog((l) => [...l, e]));
    mcp.current = client;
    (async () => {
      try {
        await client.connect();
        const t = await client.listTools();
        if (!alive) return;
        setTools(t);
        setStatus('ready');
        // Learn the elder's name from the server (cheap, read-only).
        const st = await client.callTool('get_today_status', {});
        const name = (st.structuredContent as { elder?: string } | undefined)?.elder;
        if (alive && name) setElder(name);
        if (alive && st.isError) setConnectError(st.content[0]?.text ?? '');
      } catch (e) {
        if (!alive) return;
        setStatus('error');
        setConnectError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges]);

  const submit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy || !mcp.current || status !== 'ready') return;
      setBusy(true);
      setText('');
      const id = Date.now();
      setExchanges((x) => [...x, { id, question: q, steps: [] }]);
      const patch = (fn: (e: Exchange) => Exchange) => setExchanges((xs) => xs.map((e) => (e.id === id ? fn(e) : e)));
      try {
        const answer = await ask(
          q,
          history.current,
          mcp.current,
          tools,
          {
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL!,
            anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY!,
            elderName: elder,
            familyName,
          },
          (s) => patch((e) => ({ ...e, steps: [...e.steps.filter((x) => x.kind !== 'thinking'), s] })),
        );
        patch((e) => ({ ...e, answer }));
        speakAnswer(answer);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patch((e) => ({ ...e, error: message, steps: e.steps.filter((x) => x.kind !== 'thinking') }));
        speakAnswer("Sorry, I couldn't reach NaniTV just now.");
      } finally {
        setBusy(false);
      }
    },
    [busy, status, tools, elder, familyName],
  );

  const toggleMic = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      recog.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const r = new SpeechRecognitionCtor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = (e: any) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else partial += t;
      }
      setInterim(finalText + partial);
    };
    r.onerror = (e: any) => {
      setInterim('');
      if (e.error !== 'no-speech' && e.error !== 'aborted') setConnectError(`Microphone: ${e.error}`);
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) void submit(finalText);
    };
    recog.current = r;
    setListening(true);
    r.start();
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    const c = codeInput.replace(/\D/g, '');
    if (c.length !== 6) return setConnectError('The TV code has 6 digits.');
    safeSet(CODE_KEY, c);
    setConnectError('');
    setCode(c);
  };

  if (!code) {
    return (
      <div className="as-page">
        <Header elder={elder} status={status} />
        <form className="as-card" onSubmit={onCode}>
          <h2>Which TV?</h2>
          <p className="as-muted">Enter the 6-digit code shown on the NaniTV pairing screen (or in the family app → Settings).</p>
          <input
            className="as-input"
            inputMode="numeric"
            placeholder="123456"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            maxLength={7}
          />
          <button className="as-btn">Connect</button>
          {connectError && <p className="as-error">{connectError}</p>}
        </form>
      </div>
    );
  }

  const ready = status === 'ready';
  return (
    <div className="as-page">
      <Header elder={elder} status={status} />

      <div className="as-convo">
        {exchanges.length === 0 && (
          <div className="as-hello">
            <p>
              Ask about <strong>{elder}</strong>, or send {elder} a message on the TV.
            </p>
            <div className="as-chips">
              {EXAMPLES.map((q) => (
                <button key={q} className="as-chip" disabled={!ready || busy} onClick={() => submit(q.replace(/Nani/g, elder))}>
                  “{q.replace(/Nani/g, elder)}”
                </button>
              ))}
            </div>
          </div>
        )}
        {exchanges.map((x) => (
          <div key={x.id} className="as-exchange">
            <div className="as-bubble me">{x.question}</div>
            {x.steps
              .filter((s) => s.kind !== 'answer')
              .map((s, i) => (
                <div key={i} className={`as-step ${s.kind}`}>
                  {s.kind === 'thinking' && <span className="as-dots" />}
                  {s.kind === 'tool_call' && '🔧 '}
                  {s.kind === 'tool_result' && '✓ '}
                  {s.kind === 'error' && '⚠️ '}
                  {s.kind === 'tool_call' ? (
                    <>
                      MCP <code>tools/call</code> <b>{s.text}</b>
                      {s.detail && Object.keys(s.detail as object).length ? <code className="as-args">{JSON.stringify(s.detail)}</code> : null}
                    </>
                  ) : (
                    s.text
                  )}
                  {s.ms != null && s.kind !== 'tool_call' ? <span className="as-ms"> · {s.ms} ms</span> : null}
                </div>
              ))}
            {x.answer && (
              <div className="as-bubble bot">
                {x.answer}
                <button className="as-replay" aria-label="Say again" onClick={() => speakAnswer(x.answer!)}>
                  🔊
                </button>
              </div>
            )}
            {x.error && <div className="as-bubble bot err">Sorry, something went wrong: {x.error}</div>}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="as-dock">
        {interim && <div className="as-interim">{interim}</div>}
        <button
          className={`as-mic${listening ? ' on' : ''}${busy ? ' busy' : ''}`}
          onClick={toggleMic}
          disabled={!ready || busy || !SpeechRecognitionCtor}
          aria-label={listening ? 'Stop listening' : 'Speak'}
        >
          <span className="as-ring" />
          🎙️
        </button>
        <div className="as-dock-label">
          {!SpeechRecognitionCtor
            ? 'Voice input not supported in this browser: type below'
            : busy
              ? 'Working on it…'
              : listening
                ? 'Listening… tap to stop'
                : ready
                  ? 'Tap and ask'
                  : 'Connecting to NaniTV…'}
        </div>
        <form
          className="as-type"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <input
            className="as-input"
            placeholder={`Or type, e.g. "Is ${elder} OK?"`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!ready || busy}
          />
          <button className="as-btn small" disabled={!ready || busy || !text.trim()}>
            Ask
          </button>
        </form>
        {connectError && <p className="as-error">{connectError}</p>}

        <details className="as-hood">
          <summary>
            ⚙️ Under the hood · MCP {mcp.current?.protocolVersion ?? '…'} · {tools.length} tools · {log.length} JSON-RPC calls
          </summary>
          <p className="as-muted as-small">
            This page is a real MCP client. It speaks JSON-RPC over Streamable HTTP to <code>{MCP_URL}</code> (household{' '}
            <code>{code}</code>). Gemini picks the tools via function calling; the browser runs them over MCP.{' '}
            <button
              className="as-link"
              onClick={() => {
                safeSet(CODE_KEY, '');
                setCode('');
                setExchanges([]);
              }}
            >
              Change TV
            </button>
          </p>
          {tools.length > 0 && (
            <div className="as-tools">
              {tools.map((t) => (
                <span key={t.name} className="as-tool" title={t.description}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
          {log
            .slice()
            .reverse()
            .map((e, i) => (
              <details key={`${e.id}-${i}`} className="as-rpc">
                <summary>
                  <span className={`as-rpc-status ${e.error || (e.status ?? 200) >= 400 ? 'bad' : ''}`}>{e.status ?? 'ERR'}</span>
                  <code>{e.method}</code>
                  {(e.request as any)?.params?.name ? <b> {(e.request as any).params.name}</b> : null}
                  <span className="as-ms"> {e.ms} ms</span>
                </summary>
                <div className="as-json-label">→ request</div>
                <pre>{JSON.stringify(e.request, null, 2)}</pre>
                <div className="as-json-label">← response</div>
                <pre>{e.error ? e.error : e.response ? truncate(JSON.stringify(e.response, null, 2)) : '(202 Accepted, no body)'}</pre>
              </details>
            ))}
        </details>
      </div>
    </div>
  );
}

function truncate(s: string, n = 4000) {
  return s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more chars)` : s;
}

function Header({ elder, status }: { elder: string; status: string }) {
  return (
    <header className="as-header">
      <div>
        <div className="as-title">Ask Alexa about {elder}</div>
        <div className="as-sub">Alexa+-style assistant · built on MCP</div>
      </div>
      <span className={`as-status ${status}`}>{status === 'ready' ? '● Connected' : status === 'error' ? '● Offline' : '● …'}</span>
    </header>
  );
}
