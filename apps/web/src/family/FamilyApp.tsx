import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import JoinPage from './JoinPage';
import FeedPage from './FeedPage';
import SendPage from './SendPage';
import RemindersPage from './RemindersPage';
import SettingsPage from './SettingsPage';
import { clearFamilySession, getFamilySession } from '../lib/household';
import { useHouseholdData } from './useHousehold';
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
  return <FamilyShell householdId={session.household_id} memberId={session.member_id} />;
}

function FamilyShell({ householdId, memberId }: { householdId: string; memberId: string }) {
  const data = useHouseholdData(householdId);
  const elder = data.household?.elder_name ?? 'Nani';
  const me = data.members.find((m) => m.id === memberId);
  const alerts =
    data.checkins.filter((c) => c.kind === 'help').length + data.events.filter((e) => e.status === 'missed').length;

  return (
    <div className="fam-shell">
      <header className="fam-header">
        <div>
          <div className="fam-brand">NaniTV</div>
          <div className="fam-muted fam-small">
            {me ? `${me.name} · ` : ''}
            {elder}'s TV
          </div>
        </div>
        <button
          className="fam-link"
          onClick={() => {
            if (!confirm('Leave this TV on this phone?')) return;
            clearFamilySession();
            window.location.href = '/family/join';
          }}
        >
          Switch
        </button>
      </header>

      {data.error && <p className="fam-error">{data.error}</p>}

      <main className="fam-main">
        <Routes>
          <Route index element={<FeedPage data={data} memberId={memberId} />} />
          <Route
            path="send"
            element={<SendPage householdId={householdId} memberId={memberId} elder={elder} onSent={data.addLocal} />}
          />
          <Route path="reminders" element={<RemindersPage data={data} householdId={householdId} />} />
          <Route path="settings" element={<SettingsPage data={data} householdId={householdId} />} />
          <Route path="*" element={<Navigate to="/family" replace />} />
        </Routes>
      </main>

      <nav className="fam-tabs">
        <NavLink end to="/family" className="fam-tab">
          <span>🏠</span>Feed
          {alerts > 0 && <b className="fam-tab-badge">{alerts}</b>}
        </NavLink>
        <NavLink to="/family/send" className="fam-tab">
          <span>💌</span>Send
        </NavLink>
        <NavLink to="/family/reminders" className="fam-tab">
          <span>💊</span>Medicines
        </NavLink>
        <NavLink to="/family/settings" className="fam-tab">
          <span>⚙️</span>Settings
        </NavLink>
      </nav>
    </div>
  );
}
