import { useCallback } from 'react';
import type { Household } from '../lib/types';
import { useFocusGroup } from './useFocusGroup';

export default function HelpConfirm({
  household,
  onYes,
  onNo,
}: {
  household: Household;
  onYes: () => void;
  onNo: () => void;
}) {
  const hi = household.language === 'hi';
  // Default focus on "No" so an accidental double-press doesn't raise an alarm.
  const onSelect = useCallback((id: string) => (id === 'yes' ? onYes() : onNo()), [onYes, onNo]);
  const { bind } = useFocusGroup(['yes', 'no'], { onSelect, initial: 'no' });
  return (
    <div className="tv-center">
      <div className="tv-h1">🆘 {hi ? 'Family ko bulayein?' : 'Call your family?'}</div>
      <div className="tv-sub">{hi ? 'Call family?' : 'They will be alerted right away'}</div>
      <div className="tv-row">
        <button className="tv-btn danger" {...bind('yes')}>
          {hi ? 'Haan, bulao' : 'Yes, call them'} <small>Yes</small>
        </button>
        <button className="tv-btn" {...bind('no')}>
          {hi ? 'Nahi' : 'No'} <small>No</small>
        </button>
      </div>
    </div>
  );
}
