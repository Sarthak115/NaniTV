import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listMembers } from '../lib/household';
import { listMessages } from '../lib/messages';
import type { Checkin, Household, Member, Message } from '../lib/types';

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Live TV data. Messages are oldest → newest (viewer order). */
export function useTvData(household: Household | null, onNewMessage: (m: Message) => void) {
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const onNew = useRef(onNewMessage);
  onNew.current = onNewMessage;
  const hid = household?.id;

  useEffect(() => {
    if (!hid) return;
    const db = supabase!;
    let alive = true;

    const load = () => {
      listMembers(hid).then((m) => alive && setMembers(m)).catch(console.error);
      listMessages(hid, 60)
        .then((m) => alive && setMessages(m.slice().reverse()))
        .catch(console.error);
      db.from('checkins')
        .select('*')
        .eq('household_id', hid)
        .gte('created_at', startOfToday().toISOString())
        .order('created_at')
        .then(({ data }) => alive && setCheckins((data ?? []) as Checkin[]));
    };
    load();

    const filter = `household_id=eq.${hid}`;
    const channel = db
      .channel(`tv-${hid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        onNew.current(m);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter }, (p) => {
        const m = p.new as Member;
        setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter }, (p) => {
        const c = p.new as Checkin;
        setCheckins((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      })
      .subscribe((status) => {
        console.log('[NaniTV] tv channel', status);
        // Refetch after a (re)connect so nothing sent while offline is missed.
        if (status === 'SUBSCRIBED') load();
      });

    return () => {
      alive = false;
      void db.removeChannel(channel);
    };
  }, [hid]);

  const patchMessage = (id: string, patch: Partial<Message>) =>
    setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addCheckin = (c: Checkin) => setCheckins((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));

  return { members, messages, checkins, patchMessage, addCheckin };
}
