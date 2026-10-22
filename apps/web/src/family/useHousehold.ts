import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMembers } from '../lib/household';
import { listMessages } from '../lib/messages';
import { listReminders, listTodayEvents } from '../lib/reminders';
import { startOfTodayIn } from '../lib/time';
import type { Checkin, Household, Member, Message, Reminder, ReminderEvent } from '../lib/types';

type Row = { id: string };
const upsertRow =
  <T extends Row>(row: T) =>
  (prev: T[]) =>
    prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [...prev, row];

/** Live household data for the family app. Messages are newest first; the rest are today's. */
export function useHouseholdData(householdId: string) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<ReminderEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const db = supabase!;
    let alive = true;

    const load = async () => {
      try {
        const { data: h } = await db.from('households').select('*').eq('id', householdId).maybeSingle();
        if (!alive) return;
        const hh = h as Household;
        setHousehold(hh);
        const tz = hh?.timezone ?? 'Asia/Kolkata';
        const [m, msgs, c, r, e] = await Promise.all([
          listMembers(householdId),
          listMessages(householdId),
          db
            .from('checkins')
            .select('*')
            .eq('household_id', householdId)
            .gte('created_at', startOfTodayIn(tz).toISOString())
            .order('created_at'),
          listReminders(householdId),
          listTodayEvents(householdId, tz),
        ]);
        if (!alive) return;
        setMembers(m);
        setMessages(msgs);
        setCheckins((c.data ?? []) as Checkin[]);
        setReminders(r);
        setEvents(e);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();

    const filter = `household_id=eq.${householdId}`;
    const channel = db
      .channel(`family-${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter }, (p) =>
        setMembers(upsertRow(p.new as Member)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter }, (p) =>
        setCheckins(upsertRow(p.new as Checkin)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders', filter }, (p) => {
        if (p.eventType === 'DELETE') setReminders((prev) => prev.filter((r) => r.id !== (p.old as Row).id));
        else setReminders(upsertRow(p.new as Reminder));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminder_events', filter }, (p) => {
        if (p.eventType !== 'DELETE') setEvents(upsertRow(p.new as ReminderEvent));
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
        (p) => setHousehold(p.new as Household),
      )
      .subscribe((status) => {
        // Refetch after reconnects (phones sleep a lot) so nothing is missed.
        if (status === 'SUBSCRIBED') void load();
      });

    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void db.removeChannel(channel);
    };
  }, [householdId]);

  /** Optimistically add a just-sent message (realtime will dedupe). */
  const addLocal = (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));

  // Realtime doesn't deliver DELETEs through a column filter, so remove locally.
  const removeReminderLocal = (id: string) => setReminders((prev) => prev.filter((r) => r.id !== id));

  return { household, members, messages, checkins, reminders, events, error, addLocal, setHousehold, removeReminderLocal };
}

export type HouseholdData = ReturnType<typeof useHouseholdData>;
