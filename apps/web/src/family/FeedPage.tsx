import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { memberName } from '../lib/messages';
import { supabase } from '../lib/supabase';
import { formatClock, startOfTodayIn, todayIn, zonedToDate } from '../lib/time';
import type { Message, Reaction } from '../lib/types';
import type { HouseholdData } from './useHousehold';

/** Re-render every 30s so time-based alerts (check-in deadline) appear on their own. */
function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => set((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
}

function Alerts({ data, elder, tz }: { data: HouseholdData; elder: string; tz: string }) {
  useMinuteTick();
  const { household, checkins, events, reminders } = data;
  const helps = checkins.filter((c) => c.kind === 'help');
  const missed = events.filter((e) => e.status === 'missed');
  const ok = checkins.some((c) => c.kind === 'ok');
  const deadline = household ? zonedToDate(todayIn(tz), household.checkin_deadline, tz) : null;
  const noCheckin = !!deadline && !ok && Date.now() > deadline.getTime();
  const title = (id: string) => reminders.find((r) => r.id === id)?.title ?? 'Medicine';

  return (
    <>
      {helps
        .slice()
        .reverse()
        .map((c) => (
          <div key={c.id} className="fam-alert big">
            🆘 {elder} pressed "Need help" at {formatClock(c.created_at, tz)}
            <div className="fam-small">Please call {elder} now.</div>
          </div>
        ))}
      {missed.map((e) => (
        <div key={e.id} className="fam-alert">
          💊 {elder} missed {title(e.reminder_id)} ({formatClock(e.scheduled_for, tz)})
          <div className="fam-small">Not marked as taken within 30 minutes.</div>
        </div>
      ))}
      {noCheckin && (
        <div className="fam-alert warn">
          ⏰ No "I'm OK" from {elder} yet today
          <div className="fam-small">Expected by {formatClock(deadline!, tz)}. Maybe give a call?</div>
        </div>
      )}
    </>
  );
}

function Digest({ householdId, elder, tz }: { householdId: string; elder: string; tz: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Show today's last digest straight away, if one was made.
  useEffect(() => {
    supabase!
      .from('digests')
      .select('summary')
      .eq('household_id', householdId)
      .eq('for_date', todayIn(tz))
      .maybeSingle()
      .then(({ data }) => data && setSummary(data.summary));
  }, [householdId, tz]);

  const run = async () => {
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase!.functions.invoke('daily-digest', {
      body: { household_id: householdId, date: todayIn(tz) },
    });
    setBusy(false);
    if (err || !data?.summary) return setError('Could not make the summary right now. Try again in a minute.');
    setSummary(data.summary);
  };

  return (
    <div className="fam-digest">
      {summary && (
        <div className="fam-digest-text">
          {summary.split('\n').map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      <button className="fam-btn secondary" onClick={run} disabled={busy}>
        {busy ? `✨ Reading ${elder}'s day…` : summary ? '✨ Refresh summary' : `✨ Summarise ${elder}'s day with AI`}
      </button>
      {error && <p className="fam-error fam-small">{error}</p>}
    </div>
  );
}

function TodayCard({ data, elder, tz }: { data: HouseholdData; elder: string; tz: string }) {
  const ok = data.checkins.find((c) => c.kind === 'ok');
  const title = (id: string) => data.reminders.find((r) => r.id === id)?.title ?? 'Medicine';
  return (
    <div className="fam-card fam-today">
      <h2>Today with {elder}</h2>
      {data.household && <Digest householdId={data.household.id} elder={elder} tz={tz} />}
      <div className={`fam-status ${ok ? 'good' : ''}`}>
        {ok ? `✅ ${elder} said "I'm OK" at ${formatClock(ok.created_at, tz)}` : `⌛ No check-in yet`}
      </div>
      {data.events.map((e) => (
        <div key={e.id} className={`fam-status ${e.status === 'taken' ? 'good' : e.status === 'missed' ? 'bad' : ''}`}>
          {e.status === 'taken' ? '✅' : e.status === 'missed' ? '❌' : '⏳'} {title(e.reminder_id)} · {formatClock(e.scheduled_for, tz)}
          {e.status === 'taken' && e.acted_at ? ` · taken ${formatClock(e.acted_at, tz)}` : ''}
          {e.status === 'pending' ? ' · waiting' : ''}
        </div>
      ))}
    </div>
  );
}

const REACTION: Record<Reaction, { icon: string; label: (elder: string) => string; alert?: boolean }> = {
  got_it: { icon: '👍', label: (e) => `${e} got it` },
  love: { icon: '❤️', label: (e) => `${e} loved this` },
  call_me: { icon: '📞', label: (e) => `${e} wants you to call`, alert: true },
};

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

interface Props {
  data: HouseholdData;
  memberId: string;
}

export default function FeedPage({ data, memberId }: Props) {
  const { household, members, messages } = data;
  const elder = household?.elder_name ?? 'Nani';
  const tz = household?.timezone ?? 'Asia/Kolkata';
  const today = startOfTodayIn(tz).getTime();
  const callRequests = messages.filter((m) => m.reaction === 'call_me' && new Date(m.created_at).getTime() >= today);

  return (
    <div className="fam-feed">
      <Alerts data={data} elder={elder} tz={tz} />
      {callRequests.length > 0 && (
        <div className="fam-alert">
          📞 {elder} asked for a call
          <span className="fam-small"> · {timeAgo(callRequests[0].created_at)}</span>
        </div>
      )}
      <TodayCard data={data} elder={elder} tz={tz} />

      {messages.length === 0 ? (
        <div className="fam-card fam-empty">
          <p>No messages yet.</p>
          <p className="fam-muted">Send {elder} a photo, a voice note or a few words. It'll show up big on the TV.</p>
          <Link className="fam-btn" to="/family/send">
            Send something 💌
          </Link>
        </div>
      ) : (
        messages.map((m) => (
          <FeedItem key={m.id} m={m} elder={elder} sender={m.sender_id === memberId ? 'You' : memberName(members, m.sender_id)} />
        ))
      )}
    </div>
  );
}

function FeedItem({ m, elder, sender }: { m: Message; elder: string; sender: string }) {
  const r = m.reaction ? REACTION[m.reaction] : null;
  const kind = m.type === 'photo' ? 'a photo' : m.type === 'voice' ? 'a voice note' : 'a message';
  return (
    <article className={`fam-card fam-item${r?.alert ? ' alert' : ''}`}>
      <div className="fam-item-head">
        <strong>
          {sender} sent {kind}
        </strong>
        <span className="fam-muted fam-small">{timeAgo(m.created_at)}</span>
      </div>
      {m.type === 'photo' && m.media_url && <img className="fam-photo" src={m.media_url} alt="" loading="lazy" />}
      {m.type === 'voice' && m.media_url && <audio className="fam-audio" src={m.media_url} controls preload="none" />}
      {m.text && <p>{m.text}</p>}
      {m.simplified_text && m.simplified_text !== m.text && (
        <p className="fam-simplified">
          <span className="fam-small fam-muted">On the TV: </span>
          {m.simplified_text}
        </p>
      )}
      <div className="fam-item-foot">
        {r ? (
          <span className={`fam-reaction${r.alert ? ' alert' : ''}`}>
            {r.icon} {r.label(elder)}
          </span>
        ) : m.seen_at ? (
          <span className="fam-muted fam-small">✓✓ Seen by {elder}</span>
        ) : (
          <span className="fam-muted fam-small">✓ Delivered</span>
        )}
      </div>
    </article>
  );
}
