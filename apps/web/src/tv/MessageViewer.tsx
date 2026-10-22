import { useCallback, useEffect, useRef, useState } from 'react';
import { markSeen, memberName, react } from '../lib/messages';
import { stopSpeaking } from '../lib/native';
import type { Household, Member, Message, Reaction } from '../lib/types';
import { useFocusGroup } from './useFocusGroup';
import { say, speakMessage } from './speech';

interface Props {
  household: Household;
  members: Member[];
  messages: Message[]; // oldest → newest
  startId: string | null;
  onPatch: (id: string, patch: Partial<Message>) => void;
  onToast: (text: string) => void;
}

const REPLIES: { id: Reaction; icon: string; hi: string; en: string }[] = [
  { id: 'got_it', icon: '👍', hi: 'Mil gaya', en: 'Got it' },
  { id: 'love', icon: '❤️', hi: 'Love you', en: 'Love you' },
  { id: 'call_me', icon: '📞', hi: 'Call karo', en: 'Call me' },
];

export default function MessageViewer({ household, members, messages, startId, onPatch, onToast }: Props) {
  const hi = household.language === 'hi';
  const [index, setIndex] = useState(() => {
    const i = messages.findIndex((m) => m.id === startId);
    return i >= 0 ? i : Math.max(0, messages.length - 1);
  });
  const m = messages[Math.min(index, messages.length - 1)];
  const sender = m ? memberName(members, m.sender_id) : '';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const spokenFor = useRef<string>('');

  // On open: mark seen and read text aloud (voice notes play themselves).
  useEffect(() => {
    if (!m) return;
    if (!m.seen_at) {
      onPatch(m.id, { seen_at: new Date().toISOString() });
      markSeen(m.id).catch(console.error);
    }
    stopSpeaking();
    spokenFor.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  // Speak each message once with the best text available. The AI rewrite can take
  // 10s+, so after 2.5s we read the raw text, and if the rewrite lands while this
  // message is still open we read that once more.
  const latest = useRef(m);
  latest.current = m;
  useEffect(() => {
    if (!m || m.type === 'voice' || !m.text) return;
    const key = `${m.id}:${m.simplified_text ? 'ai' : 'raw'}`;
    if (spokenFor.current === key || spokenFor.current === `${m.id}:ai`) return;
    const t = window.setTimeout(
      () => {
        const cur = latest.current;
        if (!cur || cur.id !== m.id) return;
        spokenFor.current = `${cur.id}:${cur.simplified_text ? 'ai' : 'raw'}`;
        speakMessage(household, cur, sender);
      },
      m.simplified_text ? 300 : 2500,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, m?.simplified_text, household, sender]);

  useEffect(() => () => stopSpeaking(), []);

  // Up/Down move between messages; Left/Right + Select are handled by the reply focus group.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(messages.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [messages.length]);

  const onSelect = useCallback(
    async (id: string) => {
      if (!m) return;
      const r = id as Reaction;
      onPatch(m.id, { reaction: r });
      const reply = REPLIES.find((x) => x.id === r)!;
      onToast(hi ? `${reply.icon} ${sender} ko bhej diya` : `${reply.icon} Sent to ${sender}`);
      say(
        household,
        r === 'call_me' ? `${sender} ko bata diya, woh aapko call karenge` : `${sender} ko bhej diya`,
        r === 'call_me' ? `Told ${sender}. They will call you.` : `Sent to ${sender}`,
      );
      try {
        await react(m.id, r);
      } catch (e) {
        console.error('react failed', e);
        onToast(hi ? 'Nahi bhej paaye, phir koshish karein' : 'Could not send, try again');
      }
    },
    [m, sender, household, hi, onPatch, onToast],
  );
  const { bind } = useFocusGroup(
    REPLIES.map((r) => r.id),
    { onSelect, initial: m?.reaction ?? 'got_it' },
  );

  if (!m) {
    return (
      <div className="tv-center">
        <div className="tv-h2">{hi ? 'Abhi koi sandesh nahi' : 'No messages yet'}</div>
        <div className="tv-sub">{hi ? 'Wapas jaane ke liye Back dabayein' : 'Press Back to go home'}</div>
      </div>
    );
  }

  const when = new Date(m.created_at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const body = m.simplified_text ?? (m.text ? `${sender}: ${m.text}` : '');

  return (
    <div className={`viewer viewer-${m.type}`}>
      {m.type === 'photo' && m.media_url && (
        <>
          <div className="viewer-photo-bg" style={{ backgroundImage: `url(${m.media_url})` }} />
          <img className="viewer-photo" src={m.media_url} alt="" />
        </>
      )}

      <div className="viewer-head">
        <span className="viewer-from">
          {m.type === 'voice' ? '🎙️' : m.type === 'photo' ? '📷' : '💌'} {hi ? `${sender} ne bheja` : `From ${sender}`}
        </span>
        <span className="viewer-when">
          {when} · {index + 1}/{messages.length}
        </span>
      </div>

      {m.type === 'text' && <div className="viewer-text">{body}</div>}

      {m.type === 'voice' && m.media_url && (
        <div className="viewer-voice">
          <div className={`viewer-avatar${playing ? ' playing' : ''}`}>{sender.slice(0, 1).toUpperCase()}</div>
          <div className="viewer-voice-label">
            {hi ? `${sender} ki aawaz` : `${sender}'s voice`}
            <div className={`viewer-bars${playing ? ' on' : ''}`}>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
          </div>
          <audio
            key={m.id}
            ref={audioRef}
            src={m.media_url}
            autoPlay
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={(e) => console.error('[NaniTV] audio error', m.media_url, (e.target as HTMLAudioElement).error?.code)}
          />
        </div>
      )}

      {m.type === 'photo' && body && <div className="viewer-caption">{body}</div>}

      <div className="viewer-bottom">
        <div className="tv-row">
          {REPLIES.map((r) => (
            <button
              key={r.id}
              className={`tv-btn viewer-reply${m.reaction === r.id ? ' chosen' : ''}`}
              {...bind(r.id)}
            >
              {r.icon} {hi ? r.hi : r.en}
              {(hi || m.reaction === r.id) && <small>{m.reaction === r.id ? (hi ? '✓ Bheja' : '✓ Sent') : r.en}</small>}
            </button>
          ))}
        </div>
        {messages.length > 1 && (
          <div className="viewer-hint">
            {index > 0 && <span>▲ {hi ? 'Pichla' : 'Previous'}</span>}
            {index < messages.length - 1 && <span>▼ {hi ? 'Agla sandesh' : 'Next message'}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
