import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMembers } from '../lib/household';
import { listMessages } from '../lib/messages';
import type { Household, Member, Message } from '../lib/types';

/** Live household data for the family app: household, members and messages (newest first). */
export function useHouseholdData(householdId: string) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const db = supabase!;
    let alive = true;

    Promise.all([
      db.from('households').select('*').eq('id', householdId).maybeSingle(),
      listMembers(householdId),
      listMessages(householdId),
    ])
      .then(([h, m, msgs]) => {
        if (!alive) return;
        setHousehold(h.data as Household);
        setMembers(m);
        setMessages(msgs);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter }, (p) => {
        const m = p.new as Member;
        setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
        (p) => setHousehold(p.new as Household),
      )
      .subscribe();

    return () => {
      alive = false;
      void db.removeChannel(channel);
    };
  }, [householdId]);

  /** Optimistically add a just-sent message (realtime will dedupe). */
  const addLocal = (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));

  return { household, members, messages, error, addLocal };
}
