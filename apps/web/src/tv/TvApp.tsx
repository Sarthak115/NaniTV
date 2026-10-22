import { useCallback, useEffect, useRef, useState } from 'react';
import TvStage from './TvStage';
import PairingScreen from './PairingScreen';
import { useFocusGroup } from './useFocusGroup';
import { exitApp, onBack, ttsLanguages } from '../lib/native';
import { supabaseConfigured } from '../lib/supabase';
import { getOrCreateTvHousehold, listMembers } from '../lib/household';
import type { Household } from '../lib/types';

type Screen = 'loading' | 'error' | 'pairing' | 'home';

export default function TvApp() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [household, setHousehold] = useState<Household | null>(null);
  const [error, setError] = useState('');
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const load = useCallback(async () => {
    setScreen('loading');
    try {
      if (!supabaseConfigured) throw new Error('Supabase is not configured. Fill in apps/web/.env');
      const h = await getOrCreateTvHousehold();
      setHousehold(h);
      const members = await listMembers(h.id);
      console.log('[NaniTV] household', h.id, 'code', h.pair_code, 'members', members.length);
      setScreen(members.length ? 'home' : 'pairing');
    } catch (e) {
      console.error('[NaniTV] load failed', e);
      setError(e instanceof Error ? e.message : String(e));
      setScreen('error');
    }
  }, []);

  useEffect(() => {
    void load();
    console.log('[NaniTV] ttsLanguages', JSON.stringify(ttsLanguages()));
  }, [load]);

  // Back: sub-screens return home; home / pairing-first-run exits the app.
  useEffect(
    () =>
      onBack(() => {
        const s = screenRef.current;
        console.log('nani-back on', s);
        if (s === 'pairing' && household) {
          listMembers(household.id).then((m) => (m.length ? setScreen('home') : exitApp()));
          return;
        }
        exitApp();
      }),
    [household],
  );

  return (
    <TvStage>
      {screen === 'loading' && (
        <div className="tv-center">
          <div className="tv-h2">NaniTV</div>
          <div className="tv-sub">Ek pal… / One moment…</div>
        </div>
      )}
      {screen === 'error' && <ErrorScreen message={error} onRetry={load} />}
      {screen === 'pairing' && household && (
        <PairingScreen household={household} onDone={() => setScreen('home')} />
      )}
      {screen === 'home' && household && (
        <HomePlaceholder household={household} onAddFamily={() => setScreen('pairing')} />
      )}
    </TvStage>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { bind } = useFocusGroup(['retry'], { onSelect: onRetry });
  return (
    <div className="tv-center">
      <div className="tv-h2">Kuch gadbad hai / Something went wrong</div>
      <div className="tv-error">{message}</div>
      <button className="tv-btn" {...bind('retry')}>
        Phir se <small>Try again</small>
      </button>
    </div>
  );
}

// Replaced by the real home screen in Phase 3.
function HomePlaceholder({ household, onAddFamily }: { household: Household; onAddFamily: () => void }) {
  const { bind } = useFocusGroup(['add'], { onSelect: onAddFamily });
  return (
    <div className="tv-center">
      <h1 className="tv-h1">Namaste {household.elder_name} 🙏</h1>
      <div className="tv-sub">Home screen arrives in Phase 3</div>
      <button className="tv-btn" {...bind('add')}>
        Parivaar jodein <small>Add family</small>
      </button>
    </div>
  );
}
