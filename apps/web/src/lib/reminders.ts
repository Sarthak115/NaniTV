import { supabase } from './supabase';
import { startOfTodayIn, todayIn, zonedToDate } from './time';
import type { Reminder, ReminderEvent } from './types';

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export const MISSED_AFTER_MS = 30 * 60 * 1000;

export async function listReminders(householdId: string): Promise<Reminder[]> {
  const { data, error } = await db().from('reminders').select('*').eq('household_id', householdId).order('created_at');
  if (error) throw error;
  return (data ?? []) as Reminder[];
}

/** Today's reminder events (in the household timezone). */
export async function listTodayEvents(householdId: string, tz: string): Promise<ReminderEvent[]> {
  const { data, error } = await db()
    .from('reminder_events')
    .select('*')
    .eq('household_id', householdId)
    .gte('scheduled_for', startOfTodayIn(tz).toISOString())
    .order('scheduled_for');
  if (error) throw error;
  return (data ?? []) as ReminderEvent[];
}

export async function createReminder(householdId: string, title: string, times: string[]) {
  const { data, error } = await db()
    .from('reminders')
    .insert({ household_id: householdId, title: title.trim(), times: [...new Set(times)].sort() })
    .select('*')
    .single();
  if (error) throw error;
  return data as Reminder;
}

export async function setReminderActive(id: string, active: boolean) {
  const { error } = await db().from('reminders').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteReminder(id: string) {
  const { error } = await db().from('reminders').delete().eq('id', id);
  if (error) throw error;
}

/** Today's dose slots for active reminders, created no earlier than the reminder itself. */
export function todaySlots(reminders: Reminder[], tz: string, now = new Date()) {
  const date = todayIn(tz, now);
  const slots: { reminder: Reminder; time: string; at: Date }[] = [];
  for (const r of reminders) {
    if (!r.active) continue;
    for (const time of r.times) {
      const at = zonedToDate(date, time, tz);
      // A reminder added at 3pm for "9am" shouldn't instantly count as missed today.
      if (at.getTime() < new Date(r.created_at).getTime() - 60000) continue;
      slots.push({ reminder: r, time, at });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Ensure event rows exist for slots that are due. Idempotent thanks to unique(reminder_id, scheduled_for). */
export async function ensureEvents(householdId: string, slots: { reminder: Reminder; at: Date }[]) {
  if (!slots.length) return [];
  const rows = slots.map((s) => ({
    reminder_id: s.reminder.id,
    household_id: householdId,
    scheduled_for: s.at.toISOString(),
  }));
  const { data, error } = await db()
    .from('reminder_events')
    .upsert(rows, { onConflict: 'reminder_id,scheduled_for', ignoreDuplicates: true })
    .select('*');
  if (error) throw error;
  return (data ?? []) as ReminderEvent[];
}

export async function setEventStatus(id: string, status: 'taken' | 'missed') {
  const { error } = await db()
    .from('reminder_events')
    .update({ status, acted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

export const sameInstant = (a: string | Date, b: string | Date) => new Date(a).getTime() === new Date(b).getTime();
