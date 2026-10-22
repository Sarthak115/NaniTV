import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  MISSED_AFTER_MS,
  ensureEvents,
  listReminders,
  listTodayEvents,
  sameInstant,
  setEventStatus,
  todaySlots,
} from '../lib/reminders';
import type { Household, Reminder, ReminderEvent } from '../lib/types';

const TICK_MS = 30000;
const SNOOZE_MS = 5 * 60 * 1000;

export interface ActiveReminder {
  event: ReminderEvent;
  reminder: Reminder;
}

/**
 * TV-side medicine scheduling. Every 30s: make sure today's due slots have event rows,
 * mark pending ones older than 30 min as missed, and expose the earliest due pending
 * one as `active` (shown as a full-screen takeover unless snoozed with Back).
 */
export function useReminderScheduler(household: Household | null) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<ReminderEvent[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const hid = household?.id;
  const tz = household?.timezone ?? 'Asia/Kolkata';

  const mergeEvents = useCallback((incoming: ReminderEvent[]) => {
    if (!incoming.length) return;
    setEvents((prev) => {
      const map = new Map(prev.map((e) => [e.id, e]));
      for (const e of incoming) map.set(e.id, e);
      return [...map.values()].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    });
  }, []);

  // Load + realtime.
  useEffect(() => {
    if (!hid) return;
    const db = supabase!;
    let alive = true;
    const load = () => {
      listReminders(hid).then((r) => alive && setReminders(r)).catch(console.error);
      listTodayEvents(hid, tz)
        .then((e) => alive && setEvents(e))
        .catch(console.error);
    };
    load();
    const filter = `household_id=eq.${hid}`;
    const channel = db
      .channel(`tv-reminders-${hid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders', filter }, (p) => {
        if (p.eventType === 'DELETE') {
          const old = p.old as Partial<Reminder>;
          setReminders((prev) => prev.filter((r) => r.id !== old.id));
          return;
        }
        const r = p.new as Reminder;
        setReminders((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]));
        setNow(new Date()); // re-evaluate immediately (demo "trigger in 1 min")
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminder_events', filter }, (p) => {
        if (p.eventType !== 'DELETE') mergeEvents([p.new as ReminderEvent]);
      })
      .subscribe((s) => s === 'SUBSCRIBED' && load());
    return () => {
      alive = false;
      void db.removeChannel(channel);
    };
  }, [hid, tz, mergeEvents]);

  // Clock: tick every 30s, and exactly when the next slot comes due.
  const slots = useMemo(() => todaySlots(reminders, tz, now), [reminders, tz, now]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), TICK_MS);
    const next = slots.find((s) => s.at.getTime() > Date.now());
    const t2 = next ? window.setTimeout(() => setNow(new Date()), next.at.getTime() - Date.now() + 500) : undefined;
    return () => {
      window.clearInterval(t);
      window.clearTimeout(t2);
    };
  }, [slots]);

  // Scheduling pass.
  const busy = useRef(false);
  useEffect(() => {
    if (!hid || busy.current) return;
    busy.current = true;
    (async () => {
      try {
        const due = slots.filter(
          (s) => s.at <= now && !events.some((e) => e.reminder_id === s.reminder.id && sameInstant(e.scheduled_for, s.at)),
        );
        if (due.length) {
          await ensureEvents(hid, due);
          mergeEvents(await listTodayEvents(hid, tz));
        }
        for (const e of events) {
          if (e.status === 'pending' && now.getTime() >= new Date(e.scheduled_for).getTime() + MISSED_AFTER_MS) {
            console.log('[NaniTV] reminder missed', e.id);
            await setEventStatus(e.id, 'missed');
            mergeEvents([{ ...e, status: 'missed', acted_at: new Date().toISOString() }]);
          }
        }
      } catch (err) {
        console.error('[NaniTV] scheduler', err);
      } finally {
        busy.current = false;
      }
    })();
  }, [hid, tz, now, slots, events, mergeEvents]);

  const due = useMemo(() => {
    const t = now.getTime();
    return events
      .filter((e) => e.status === 'pending')
      .filter((e) => {
        const at = new Date(e.scheduled_for).getTime();
        return t >= at && t < at + MISSED_AFTER_MS;
      })
      .map((e) => ({ event: e, reminder: reminders.find((r) => r.id === e.reminder_id) }))
      .filter((x): x is ActiveReminder => !!x.reminder);
  }, [events, reminders, now]);

  const active = due.find((d) => !(snoozed[d.event.id] > now.getTime())) ?? null;

  // Wake up when a snooze ends.
  useEffect(() => {
    const ends = Object.values(snoozed).filter((t) => t > Date.now());
    if (!ends.length) return;
    const t = window.setTimeout(() => setNow(new Date()), Math.min(...ends) - Date.now() + 200);
    return () => window.clearTimeout(t);
  }, [snoozed]);

  const markTaken = useCallback(
    async (e: ReminderEvent) => {
      mergeEvents([{ ...e, status: 'taken', acted_at: new Date().toISOString() }]);
      await setEventStatus(e.id, 'taken');
    },
    [mergeEvents],
  );

  const snooze = useCallback((e: ReminderEvent) => {
    setSnoozed((s) => ({ ...s, [e.id]: Date.now() + SNOOZE_MS }));
  }, []);

  return { reminders, events, slots, active, markTaken, snooze };
}
