import { FormEvent, useState } from 'react';
import { createReminder, deleteReminder, setReminderActive } from '../lib/reminders';
import { formatTime } from '../lib/time';
import type { HouseholdData } from './useHousehold';

const PRESETS = ['BP tablet', 'Sugar tablet', 'Thyroid tablet', 'Vitamin', 'Eye drops'];

export default function RemindersPage({ data, householdId }: { data: HouseholdData; householdId: string }) {
  const elder = data.household?.elder_name ?? 'Nani';
  const [title, setTitle] = useState('');
  const [times, setTimes] = useState<string[]>(['09:00']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const clean = times.filter(Boolean);
    if (!title.trim() || !clean.length) return;
    setBusy(true);
    setError('');
    try {
      await createReminder(householdId, title, clean);
      setTitle('');
      setTimes(['09:00']);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const run = (fn: () => Promise<void>) => fn().catch((err) => setError(err instanceof Error ? err.message : String(err)));

  return (
    <div className="fam-feed">
      <form className="fam-card" onSubmit={add}>
        <h2>Add a medicine reminder</h2>
        <p className="fam-muted">
          At these times {elder}'s TV shows a big reminder with a chime. If {elder} doesn't press "Taken" within 30 minutes, you get a red alert.
        </p>
        <input
          className="fam-input"
          placeholder="Medicine, e.g. BP tablet"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
        />
        <div className="fam-chips">
          {PRESETS.map((p) => (
            <button type="button" key={p} className={`fam-chip${title === p ? ' on' : ''}`} onClick={() => setTitle(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="fam-label">Times</div>
        {times.map((t, i) => (
          <div key={i} className="fam-time-row">
            <input
              className="fam-input"
              type="time"
              value={t}
              onChange={(e) => setTimes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {times.length > 1 && (
              <button type="button" className="fam-icon-btn" onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="fam-link fam-link-inline" onClick={() => setTimes((prev) => [...prev, '21:00'])}>
          + Add another time
        </button>
        <button className="fam-btn" disabled={busy || !title.trim()}>
          {busy ? 'Saving…' : 'Save reminder'}
        </button>
      </form>

      {error && <p className="fam-error">{error}</p>}

      {data.reminders.length === 0 ? (
        <p className="fam-muted fam-center">No reminders yet.</p>
      ) : (
        data.reminders.map((r) => (
          <div key={r.id} className={`fam-card fam-rem${r.active ? '' : ' off'}`}>
            <div className="fam-item-head">
              <strong>💊 {r.title}</strong>
              <label className="fam-switch">
                <input type="checkbox" checked={r.active} onChange={(e) => run(() => setReminderActive(r.id, e.target.checked))} />
                <span>{r.active ? 'On' : 'Off'}</span>
              </label>
            </div>
            <div className="fam-chips">
              {r.times.map((t) => (
                <span key={t} className="fam-chip static">
                  {formatTime(t)}
                </span>
              ))}
            </div>
            <button
              className="fam-link fam-link-inline"
              onClick={() =>
                confirm(`Delete "${r.title}"?`) &&
                run(async () => {
                  await deleteReminder(r.id);
                  data.removeReminderLocal(r.id);
                })
              }
            >
              Delete
            </button>
          </div>
        ))
      )}
    </div>
  );
}
