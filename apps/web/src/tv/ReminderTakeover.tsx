import { useCallback, useEffect } from 'react';
import { chimeReminder } from '../lib/sound';
import { formatClock } from '../lib/time';
import type { Household } from '../lib/types';
import type { ActiveReminder } from './useReminderScheduler';
import { useFocusGroup } from './useFocusGroup';
import { say } from './speech';

const RECHIME_MS = 5 * 60 * 1000;

export default function ReminderTakeover({
  household,
  active,
  onTaken,
}: {
  household: Household;
  active: ActiveReminder;
  onTaken: () => void;
}) {
  const hi = household.language === 'hi';
  const title = active.reminder.title;

  // Chime + narrate now, and again every 5 minutes until acted on (or missed).
  useEffect(() => {
    const announce = () => {
      chimeReminder();
      window.setTimeout(
        () =>
          say(
            household,
            `${household.elder_name}, ${title} ka samay ho gaya. Dawai lekar OK dabaiye.`,
            `${household.elder_name}, it's time for your ${title}. Take it, then press OK.`,
          ),
        1800,
      );
    };
    announce();
    const t = window.setInterval(announce, RECHIME_MS);
    return () => window.clearInterval(t);
  }, [active.event.id, household, title]);

  const onSelect = useCallback(() => onTaken(), [onTaken]);
  const { bind } = useFocusGroup(['taken'], { onSelect });

  return (
    <div className="takeover">
      <div className="takeover-pill">💊</div>
      <div className="tv-h1 takeover-title">{hi ? `${title} ka samay ho gaya` : `Time for your ${title}`}</div>
      <div className="tv-sub">
        {hi ? `Dawai ka samay · ${formatClock(active.event.scheduled_for, household.timezone)}` : `Medicine time · ${formatClock(active.event.scheduled_for, household.timezone)}`}
      </div>
      <button className="tv-btn success takeover-btn" {...bind('taken')}>
        ✓ {hi ? 'Le liya' : 'Taken'}
        {hi && <small>Taken</small>}
      </button>
      <div className="takeover-hint">{hi ? 'Baad mein yaad dilayein: Back dabayein' : 'Remind me in 5 min: press Back'}</div>
    </div>
  );
}
