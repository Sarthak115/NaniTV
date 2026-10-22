import { supabase } from './supabase';
import type { Household, Member } from './types';

const TV_KEY = 'nanitv.tv.household_id';
const FAMILY_KEY = 'nanitv.family';

function db() {
  if (!supabase) throw new Error('Supabase is not configured (apps/web/.env)');
  return supabase;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));

let tvHouseholdPromise: Promise<Household> | null = null;

/** TV side: load the stored household, or create a new one with a fresh pair code. */
export function getOrCreateTvHousehold(): Promise<Household> {
  // Shared so concurrent callers (React StrictMode double effects) can't create two households.
  tvHouseholdPromise ??= loadOrCreate().catch((e) => {
    tvHouseholdPromise = null;
    throw e;
  });
  return tvHouseholdPromise;
}

async function loadOrCreate(): Promise<Household> {
  const storedId = safeGet(TV_KEY);
  if (storedId) {
    const { data } = await db().from('households').select('*').eq('id', storedId).maybeSingle();
    if (data) return data as Household;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db()
      .from('households')
      .insert({ pair_code: randomCode() })
      .select('*')
      .single();
    if (data) {
      safeSet(TV_KEY, data.id);
      return data as Household;
    }
    if (error && error.code !== '23505') throw error; // 23505 = pair_code collision, retry
  }
  throw new Error('Could not create household');
}

export function resetTvHousehold() {
  tvHouseholdPromise = null;
  safeSet(TV_KEY, null);
}

export async function findHouseholdByCode(code: string): Promise<Household | null> {
  const { data, error } = await db().from('households').select('*').eq('pair_code', code.trim()).maybeSingle();
  if (error) throw error;
  return (data as Household) ?? null;
}

export async function listMembers(householdId: string): Promise<Member[]> {
  const { data, error } = await db()
    .from('members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function joinHousehold(householdId: string, name: string, relation: string): Promise<Member> {
  const { data, error } = await db()
    .from('members')
    .insert({ household_id: householdId, name: name.trim(), relation: relation.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  const member = data as Member;
  safeSet(FAMILY_KEY, JSON.stringify({ member_id: member.id, household_id: householdId }));
  return member;
}

export interface FamilySession {
  member_id: string;
  household_id: string;
}

export function getFamilySession(): FamilySession | null {
  const raw = safeGet(FAMILY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FamilySession;
  } catch {
    return null;
  }
}

export function clearFamilySession() {
  safeSet(FAMILY_KEY, null);
}
