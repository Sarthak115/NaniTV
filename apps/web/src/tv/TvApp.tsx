import { useCallback, useEffect, useRef, useState } from 'react';
import TvStage from './TvStage';
import PairingScreen from './PairingScreen';
import HomeScreen from './HomeScreen';
import MessageViewer from './MessageViewer';
import HelpConfirm from './HelpConfirm';
import { useFocusGroup } from './useFocusGroup';
import { useTvData } from './useTvData';
import { say } from './speech';
import { exitApp, onBack, ttsLanguages } from '../lib/native';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { getOrCreateTvHousehold, listMembers } from '../lib/household';
import { memberName } from '../lib/messages';
import { chimeMessage } from '../lib/sound';
import type { Checkin, Household, Message } from '../lib/types';

type Screen = 'loading' | 'error' | 'pairing' | 'home' | 'viewer' | 'help';

export default function TvApp() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [household, setHousehold] = useState<Household | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [focusMessages, setFocusMessages] = useState(0);
  const [viewerStart, setViewerStart] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const bannerTimer = useRef<number>();
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const membersRef = useRef<ReturnType<typeof useTvData>['members']>([]);
  const onNewMessage = useCallback(
    (m: Message) => {
      if (!household) return;
      const name = memberName(membersRef.current, m.sender_id);
      const hi = household.language === 'hi';
      const what =
        m.type === 'photo' ? (hi ? 'photo' : 'a photo') : m.type === 'voice' ? (hi ? 'aawaz sandesh' : 'a voice note') : hi ? 'sandesh' : 'a message';
      const text = hi ? `${name} ne ${what} bheja` : `${name} sent ${what}`;
      console.log('[NaniTV] new message', m.type, 'from', name);
      chimeMessage();
      if (screenRef.current === 'home') {
        setBanner(text);
        setFocusMessages((n) => n + 1);
        window.clearTimeout(bannerTimer.current);
        bannerTimer.current = window.setTimeout(() => setBanner(null), 20000);
        window.setTimeout(() => say(household, `${text}. Dekhne ke liye OK dabayein.`, `${text}. Press OK to see it.`), 900);
      } else if (screenRef.current === 'viewer') {
        showToast(`💌 ${text} ▼`);
      }
    },
    [household, showToast],
  );

  const data = useTvData(screen === 'loading' || screen === 'error' ? null : household, onNewMessage);
  membersRef.current = data.members;
  const unread = data.messages.filter((m) => !m.seen_at).length;

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

  // Back: sub-screens return home; home exits the app.
  useEffect(
    () =>
      onBack(() => {
        const s = screenRef.current;
        console.log('nani-back on', s);
        if (s === 'viewer' || s === 'help') return setScreen('home');
        if (s === 'pairing' && household) {
          listMembers(household.id).then((m) => (m.length ? setScreen('home') : exitApp()));
          return;
        }
        exitApp();
      }),
    [household],
  );

  const openMessages = useCallback(() => {
    setBanner(null);
    const firstUnread = data.messages.find((m) => !m.seen_at);
    setViewerStart(firstUnread?.id ?? data.messages[data.messages.length - 1]?.id ?? null);
    setScreen('viewer');
  }, [data.messages]);

  const checkin = useCallback(
    async (kind: Checkin['kind']) => {
      if (!household) return;
      const { data: row, error: err } = await supabase!
        .from('checkins')
        .insert({ household_id: household.id, kind })
        .select('*')
        .single();
      if (err) {
        console.error('checkin failed', err);
        showToast(household.language === 'hi' ? 'Nahi bhej paaye, phir koshish karein' : 'Could not send, try again');
        return false;
      }
      data.addCheckin(row as Checkin);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household, showToast],
  );

  const onOk = useCallback(async () => {
    if (!household) return;
    if (await checkin('ok')) {
      showToast(household.language === 'hi' ? '✓ Family ko bata diya ki aap theek hain' : '✓ Family knows you are OK');
      say(household, 'Bahut accha! Family ko bata diya ki aap theek hain.', 'Wonderful! Your family knows you are OK.');
    }
  }, [household, checkin, showToast]);

  const onHelpYes = useCallback(async () => {
    if (!household) return;
    setScreen('home');
    if (await checkin('help')) {
      showToast(household.language === 'hi' ? '🆘 Family ko khabar kar di' : '🆘 Your family has been alerted');
      say(household, 'Family ko khabar kar di hai. Woh jaldi aapse baat karenge.', 'Your family has been alerted. They will contact you soon.');
    }
  }, [household, checkin, showToast]);

  return (
    <TvStage>
      {screen === 'loading' && (
        <div className="tv-center">
          <div className="tv-h2">NaniTV</div>
          <div className="tv-sub">Ek pal… / One moment…</div>
        </div>
      )}
      {screen === 'error' && <ErrorScreen message={error} onRetry={load} />}
      {screen === 'pairing' && household && <PairingScreen household={household} onDone={() => setScreen('home')} />}
      {screen === 'home' && household && (
        <HomeScreen
          household={household}
          unread={unread}
          total={data.messages.length}
          checkins={data.checkins}
          banner={banner}
          focusMessages={focusMessages}
          onOk={onOk}
          onMessages={openMessages}
          onHelp={() => setScreen('help')}
        />
      )}
      {screen === 'viewer' && household && (
        <MessageViewer
          household={household}
          members={data.members}
          messages={data.messages}
          startId={viewerStart}
          onPatch={data.patchMessage}
          onToast={showToast}
        />
      )}
      {screen === 'help' && household && (
        <HelpConfirm household={household} onYes={onHelpYes} onNo={() => setScreen('home')} />
      )}
      {toast && <div className="tv-toast">{toast}</div>}
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
