import { useCallback, useEffect, useState } from 'react';
import TvStage from './TvStage';
import { useFocusGroup } from './useFocusGroup';
import { exitApp, isOnTv, onBack, speak, ttsLanguages } from '../lib/native';
import { supabaseConfigured } from '../lib/supabase';

// Phase 1 placeholder: proves D-pad focus, Select→Enter, Back→`nani-back`, and the TTS bridge.
export default function TvApp() {
  const [lastKey, setLastKey] = useState('—');
  const [langs, setLangs] = useState<string[]>([]);

  useEffect(() => {
    const l = ttsLanguages();
    console.log('[NaniTV] ttsLanguages', JSON.stringify(l));
    setLangs(l);
    // TTS engine may initialise after page load on the device; ask again shortly.
    const t = setTimeout(() => {
      const l2 = ttsLanguages();
      console.log('[NaniTV] ttsLanguages (retry)', JSON.stringify(l2));
      setLangs(l2);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      console.log('[NaniTV] keydown', e.key, e.keyCode);
      setLastKey(`${e.key} (${e.keyCode})`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () =>
      onBack(() => {
        console.log('nani-back');
        setLastKey('Back (nani-back)');
      }),
    [],
  );

  const onSelect = useCallback((id: string) => {
    if (id === 'hi') speak('नमस्ते नानी, आप कैसी हैं?', 'hi');
    if (id === 'en') speak('Hello Nani, how are you today?', 'en');
    if (id === 'exit') exitApp();
  }, []);

  const { bind } = useFocusGroup(['hi', 'en', 'exit'], { onSelect });

  return (
    <TvStage>
      <div className="tv-center">
        <h1 className="tv-h1">Namaste Nani 🙏</h1>
        <div className="tv-sub">NaniTV — Phase 1 shell check ✓ live reload</div>
        <div className="tv-row">
          <button className="tv-btn" {...bind('hi')}>
            बोलो हिंदी <small>Speak Hindi</small>
          </button>
          <button className="tv-btn" {...bind('en')}>
            Bolo English <small>Speak English</small>
          </button>
          <button className="tv-btn danger" {...bind('exit')}>
            Band karo <small>Exit</small>
          </button>
        </div>
      </div>
      <div className="tv-debug">
        key: {lastKey} · native: {isOnTv() ? 'yes' : 'no'} · supabase:{' '}
        {supabaseConfigured ? 'yes' : 'no'} · tts: {langs.join(', ') || '—'}
      </div>
    </TvStage>
  );
}
