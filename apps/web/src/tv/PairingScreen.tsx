import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { listMembers } from '../lib/household';
import { chimeMessage } from '../lib/sound';
import { speak } from '../lib/native';
import type { Household, Member } from '../lib/types';
import { useFocusGroup } from './useFocusGroup';

interface Props {
  household: Household;
  onDone: () => void;
  enabled?: boolean;
}

export default function PairingScreen({ household, onDone, enabled = true }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const familyOrigin = import.meta.env.VITE_FAMILY_URL || window.location.origin;
  const joinUrl = `${familyOrigin}/family/join?code=${household.pair_code}`;
  const hi = household.language === 'hi';

  useEffect(() => {
    let alive = true;
    listMembers(household.id).then((m) => alive && setMembers(m)).catch(console.error);

    const channel = supabase!
      .channel(`members-${household.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'members', filter: `household_id=eq.${household.id}` },
        (payload) => {
          const m = payload.new as Member;
          console.log('[NaniTV] member joined', m.name);
          setMembers((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          setToast(`${m.name} joined ❤️`);
          chimeMessage();
          speak(hi ? `${m.name} judd gaye` : `${m.name} joined`, household.language);
          window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 6000);
        },
      )
      .subscribe((status) => console.log('[NaniTV] members channel', status));

    return () => {
      alive = false;
      window.clearTimeout(toastTimer.current);
      void supabase!.removeChannel(channel);
    };
  }, [household.id, household.language, hi]);

  const ids = useMemo(() => (members.length ? ['done'] : []), [members.length]);
  const onSelect = useCallback((id: string) => id === 'done' && onDone(), [onDone]);
  const { bind } = useFocusGroup(ids, { onSelect, enabled: enabled && ids.length > 0 });

  const code = household.pair_code.replace(/(\d{3})(\d{3})/, '$1 $2');

  return (
    <div className="pair">
      <div className="pair-left">
        <h1 className="tv-h1">
          {hi ? `Namaste ${household.elder_name} 🙏` : `Hello ${household.elder_name} 🙏`}
        </h1>
        <p className="pair-lead">
          {hi ? 'Parivaar ko jodein' : 'Connect your family'}
          <br />
          <span className="tv-sub">Scan with your phone camera</span>
        </p>
        <div className="pair-code-label tv-sub">{hi ? 'Ya yeh code daalein' : 'Or enter this code'}</div>
        <div className="pair-code">{code}</div>

        <div className="pair-members">
          {members.length === 0 ? (
            <div className="tv-sub">{hi ? 'Intezaar…' : 'Waiting for family…'}</div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="pair-chip">
                ❤️ {m.name}
                {m.relation ? <small> · {m.relation}</small> : null}
              </div>
            ))
          )}
        </div>

        {members.length > 0 && (
          <button className="tv-btn success pair-done" {...bind('done')}>
            {hi ? 'Aage badhein' : 'Continue'} <small>Continue</small>
          </button>
        )}
      </div>

      <div className="pair-qr">
        <QRCodeSVG value={joinUrl} size={620} level="M" marginSize={2} />
      </div>

      {toast && <div className="tv-toast">{toast}</div>}
    </div>
  );
}
