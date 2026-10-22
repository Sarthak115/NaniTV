import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createReminder, listReminders } from '../lib/reminders';
import { hhmmIn } from '../lib/time';
import type { Household, Language } from '../lib/types';
import type { HouseholdData } from './useHousehold';

export default function SettingsPage({ data, householdId }: { data: HouseholdData; householdId: string }) {
  const h = data.household;
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language>('hi');
  const [deadline, setDeadline] = useState('11:00');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!h) return;
    setName(h.elder_name);
    setLanguage(h.language);
    setDeadline(h.checkin_deadline.slice(0, 5));
  }, [h]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { data: row, error: err } = await supabase!
      .from('households')
      .update({ elder_name: name.trim() || 'Nani', language, checkin_deadline: deadline })
      .eq('id', householdId)
      .select('*')
      .single();
    if (err) return setError(err.message);
    data.setHousehold(row as Household);
    setSaved('Saved ✓ The TV updates right away.');
    window.setTimeout(() => setSaved(''), 3000);
  };

  return (
    <div className="fam-feed">
      <form className="fam-card" onSubmit={save}>
        <h2>Settings</h2>
        <label className="fam-label">
          What does the family call them?
          <input className="fam-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Nani" />
        </label>
        <div className="fam-label">TV language</div>
        <div className="fam-chips">
          {(
            [
              ['hi', 'हिंदी Hindi'],
              ['en', 'English'],
            ] as const
          ).map(([v, label]) => (
            <button type="button" key={v} className={`fam-chip${language === v ? ' on' : ''}`} onClick={() => setLanguage(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="fam-label">
          Alert me if there's no "I'm OK" by
          <input className="fam-input" type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <button className="fam-btn">Save</button>
        {saved && <p className="fam-ok">{saved}</p>}
        {error && <p className="fam-error">{error}</p>}
      </form>

      {h && (
        <div className="fam-card">
          <h2>Add more family</h2>
          <p className="fam-muted">
            Share the TV code <strong className="fam-code-inline">{h.pair_code}</strong> or this link:
          </p>
          <code className="fam-url">{`${window.location.origin}/family/join?code=${h.pair_code}`}</code>
        </div>
      )}

      <DemoTools householdId={householdId} tz={h?.timezone ?? 'Asia/Kolkata'} />
    </div>
  );
}

/** Hidden helpers so the demo video doesn't have to wait for real reminder times. */
function DemoTools({ householdId, tz }: { householdId: string; tz: string }) {
  const [status, setStatus] = useState('');
  const run = async (label: string, fn: () => Promise<void>) => {
    setStatus(`${label}…`);
    try {
      await fn();
      setStatus(`${label} ✓`);
    } catch (e) {
      setStatus(`${label} failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const triggerSoon = () =>
    run('Reminder scheduled for the next minute', async () => {
      await createReminder(householdId, 'BP tablet', [hhmmIn(tz, 1)]);
    });

  const simulateMissed = () =>
    run('Missed dose simulated', async () => {
      const existing = (await listReminders(householdId)).find((r) => r.active);
      const reminder = existing ?? (await createReminder(householdId, 'BP tablet', ['09:00']));
      const at = new Date(Date.now() - 31 * 60000);
      at.setSeconds(0, 0);
      const { error } = await supabase!.from('reminder_events').insert({
        reminder_id: reminder.id,
        household_id: householdId,
        scheduled_for: at.toISOString(),
        status: 'missed',
        acted_at: new Date().toISOString(),
      });
      if (error) throw error;
    });

  return (
    <details className="fam-card fam-demo">
      <summary>🎬 Demo tools</summary>
      <p className="fam-muted fam-small">For recording the demo without waiting for real times.</p>
      <button className="fam-btn secondary" onClick={triggerSoon}>
        ⏰ Trigger a reminder in ~1 min
      </button>
      <button className="fam-btn secondary" onClick={simulateMissed}>
        🔴 Simulate a missed dose
      </button>
      {status && <p className="fam-small">{status}</p>}
    </details>
  );
}
