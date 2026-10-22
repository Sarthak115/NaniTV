import { Link } from 'react-router-dom';
import { memberName } from '../lib/messages';
import type { Message, Reaction } from '../lib/types';
import type { useHouseholdData } from './useHousehold';

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
  data: ReturnType<typeof useHouseholdData>;
  memberId: string;
}

export default function FeedPage({ data, memberId }: Props) {
  const { household, members, messages } = data;
  const elder = household?.elder_name ?? 'Nani';
  const callRequests = messages.filter((m) => m.reaction === 'call_me');

  return (
    <div className="fam-feed">
      {callRequests.length > 0 && (
        <div className="fam-alert">
          📞 {elder} asked for a call
          <span className="fam-small"> · {timeAgo(callRequests[0].created_at)}</span>
        </div>
      )}

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
