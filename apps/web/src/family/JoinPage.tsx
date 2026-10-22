import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { findHouseholdByCode, joinHousehold } from '../lib/household';
import type { Household } from '../lib/types';

const RELATIONS = ['Granddaughter', 'Grandson', 'Daughter', 'Son', 'Daughter-in-law', 'Son-in-law', 'Other'];

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [household, setHousehold] = useState<Household | null>(null);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (c: string) => {
    setError('');
    setBusy(true);
    try {
      const h = await findHouseholdByCode(c);
      if (!h) setError('No TV found with that code. Check the 6 digits on the TV screen.');
      setHousehold(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const c = params.get('code');
    if (c && /^\d{6}$/.test(c)) void lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) return setError('The code has 6 digits.');
    void lookup(c);
  };

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!household || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await joinHousehold(household.id, name, relation);
      navigate('/family', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="fam-page">
      <h1>NaniTV</h1>
      {!household ? (
        <form className="fam-card" onSubmit={onCode}>
          <h2>Connect to the family TV</h2>
          <p className="fam-muted">Enter the 6-digit code shown on the TV.</p>
          <input
            className="fam-input fam-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="fam-btn" disabled={busy}>
            {busy ? 'Checking…' : 'Find TV'}
          </button>
        </form>
      ) : (
        <form className="fam-card" onSubmit={onJoin}>
          <h2>Join {household.elder_name}'s TV ❤️</h2>
          <p className="fam-muted">{household.elder_name} will see your name on the TV.</p>
          <label className="fam-label">
            Your name
            <input
              className="fam-input"
              autoFocus
              autoComplete="given-name"
              placeholder="Riya"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
          </label>
          <div className="fam-label">You are {household.elder_name}'s…</div>
          <div className="fam-chips">
            {RELATIONS.map((r) => (
              <button
                type="button"
                key={r}
                className={`fam-chip${relation === r ? ' on' : ''}`}
                onClick={() => setRelation(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="fam-btn" disabled={busy || !name.trim()}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>
      )}
      {error && <p className="fam-error">{error}</p>}
    </div>
  );
}
