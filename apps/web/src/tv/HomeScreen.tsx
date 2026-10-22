import { useCallback, useEffect, useState } from 'react';
import type { Checkin, Household } from '../lib/types';
import { useFocusGroup } from './useFocusGroup';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function greeting(h: number, hi: boolean) {
  if (h < 12) return hi ? 'Suprabhat' : 'Good morning';
  if (h < 17) return hi ? 'Namaste' : 'Good afternoon';
  return hi ? 'Shubh sandhya' : 'Good evening';
}

export interface MedItem {
  key: string;
  title: string;
  at: Date;
  status: 'upcoming' | 'pending' | 'taken' | 'missed';
}

interface Props {
  household: Household;
  unread: number;
  total: number;
  checkins: Checkin[];
  meds: MedItem[];
  banner: string | null;
  focusMessages: number; // bump to move focus to Messages (new message arrived)
  onOk: () => void;
  onMessages: () => void;
  onHelp: () => void;
}

export default function HomeScreen(p: Props) {
  const hi = p.household.language === 'hi';
  const now = useNow();
  const okDone = p.checkins.some((c) => c.kind === 'ok');

  const onSelect = useCallback(
    (id: string) => (id === 'ok' ? p.onOk() : id === 'msgs' ? p.onMessages() : p.onHelp()),
    [p],
  );
  const { bind, setFocused } = useFocusGroup(['ok', 'msgs', 'help'], {
    onSelect,
    initial: p.unread ? 'msgs' : 'ok',
  });
  // Jump to Messages when something new arrives, or once unread messages finish loading.
  const hasUnread = p.unread > 0;
  useEffect(() => {
    if (p.focusMessages || hasUnread) setFocused('msgs');
  }, [p.focusMessages, hasUnread, setFocused]);

  const time = now.toLocaleTimeString(hi ? 'en-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="home">
      <div className="home-top">
        <div>
          <h1 className="tv-h1">
            {greeting(now.getHours(), hi)} {p.household.elder_name} 🙏
          </h1>
          <div className="home-date">{date}</div>
        </div>
        <div className="home-clock">{time}</div>
      </div>

      {p.banner ? (
        <div className="home-banner">💌 {p.banner}</div>
      ) : (
        <div className="home-banner quiet">
          {p.unread
            ? hi
              ? `${p.unread} naye sandesh aapka intezaar kar rahe hain`
              : `${p.unread} new messages are waiting`
            : hi
              ? 'Parivaar aapke saath hai ❤️'
              : 'Your family is with you ❤️'}
        </div>
      )}

      {p.meds.length > 0 && (
        <div className="home-meds">
          <span className="home-meds-label">💊 {hi ? 'Aaj ki dawai' : "Today's medicine"}</span>
          {p.meds.slice(0, 5).map((m) => (
            <span key={m.key} className={`home-med ${m.status}`}>
              {m.status === 'taken' ? '✓' : m.status === 'missed' ? '✗' : '○'} {m.title}{' '}
              {m.at.toLocaleTimeString('en-IN', { timeZone: p.household.timezone, hour: 'numeric', minute: '2-digit' })}
            </span>
          ))}
        </div>
      )}

      <div className="tv-row home-buttons">
        <button className={`tv-btn home-btn ${okDone ? 'success' : ''}`} {...bind('ok')}>
          {okDone ? '✓ ' : '🙂 '}
          {hi ? 'Main theek hoon' : "I'm OK"}
          <small>{okDone ? (hi ? 'Aaj bata diya' : 'Done for today') : "I'm OK"}</small>
        </button>
        <button className={`tv-btn home-btn ${p.unread ? 'has-new' : ''}`} {...bind('msgs')}>
          💌 {hi ? 'Sandesh' : 'Messages'}
          <small>
            {p.unread ? (hi ? `${p.unread} naye · new` : `${p.unread} new`) : p.total ? (hi ? 'Sab dekhe · Messages' : 'All seen') : 'Messages'}
          </small>
          {p.unread > 0 && <span className="home-badge">{p.unread}</span>}
        </button>
        <button className="tv-btn home-btn danger" {...bind('help')}>
          🆘 {hi ? 'Madad chahiye' : 'Need help'}
          <small>Need help</small>
        </button>
      </div>
    </div>
  );
}
