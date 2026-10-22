import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import JoinPage from './JoinPage';
import { clearFamilySession, getFamilySession, listMembers } from '../lib/household';
import { supabase } from '../lib/supabase';
import type { Household, Member } from '../lib/types';
import './family.css';

export default function FamilyApp() {
  return (
    <Routes>
      <Route path="join" element={<JoinPage />} />
      <Route path="*" element={<RequireSession />} />
    </Routes>
  );
}

function RequireSession() {
  const session = getFamilySession();
  if (!session) return <Navigate to="/family/join" replace />;
  return <FamilyHome householdId={session.household_id} memberId={session.member_id} />;
}

// Replaced by the feed / send / reminders tabs in Phase 3–4.
function FamilyHome({ householdId, memberId }: { householdId: string; memberId: string }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    supabase!
      .from('households')
      .select('*')
      .eq('id', householdId)
      .maybeSingle()
      .then(({ data }) => setHousehold(data as Household));
    listMembers(householdId).then(setMembers).catch(console.error);
  }, [householdId]);

  const me = members.find((m) => m.id === memberId);

  return (
    <div className="fam-page">
      <h1>NaniTV</h1>
      <div className="fam-card">
        <h2>You're connected ❤️</h2>
        <p>
          {me ? `${me.name}, you` : 'You'} can now send messages to {household?.elder_name ?? 'Nani'}'s TV.
        </p>
        <p className="fam-muted">Family on this TV: {members.map((m) => m.name).join(', ') || '…'}</p>
      </div>
      <button
        className="fam-link"
        onClick={() => {
          clearFamilySession();
          window.location.href = '/family/join';
        }}
      >
        Not you? Join again
      </button>
    </div>
  );
}
