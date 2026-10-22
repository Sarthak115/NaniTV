import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { downscaleImage, pickAudioMime, sendPhoto, sendText, sendVoice } from '../lib/messages';
import type { Message } from '../lib/types';

type Tab = 'photo' | 'voice' | 'text';
const MAX_SECONDS = 30;

interface Props {
  householdId: string;
  memberId: string;
  elder: string;
  onSent: (m: Message) => void;
}

export default function SendPage(props: Props) {
  const [tab, setTab] = useState<Tab>('photo');
  return (
    <div className="fam-send">
      <div className="fam-seg">
        {(
          [
            ['photo', '📷', 'Photo'],
            ['voice', '🎙️', 'Voice'],
            ['text', '✍️', 'Text'],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className={`fam-seg-btn${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>
      {tab === 'photo' && <PhotoForm {...props} />}
      {tab === 'voice' && <VoiceForm {...props} />}
      {tab === 'text' && <TextForm {...props} />}
    </div>
  );
}

function useSend(onSent: (m: Message) => void) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<Message>) => {
    setBusy(true);
    setError('');
    try {
      const m = await fn();
      onSent(m);
      navigate('/family');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function PhotoForm({ householdId, memberId, elder, onSent }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [prepping, setPrepping] = useState(false);
  const { busy, error, run } = useSend(onSent);
  const [prepError, setPrepError] = useState('');

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPrepping(true);
    setPrepError('');
    try {
      const b = await downscaleImage(f);
      setBlob(b);
      setPreview(URL.createObjectURL(b));
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrepping(false);
    }
  };

  return (
    <div className="fam-card">
      <h2>Send {elder} a photo</h2>
      {preview ? (
        <img className="fam-photo" src={preview} alt="Preview" />
      ) : (
        <div className="fam-pick-row">
          <label className="fam-pick">
            📷 Camera
            <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
          </label>
          <label className="fam-pick">
            🖼️ Gallery
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
        </div>
      )}
      {prepping && <p className="fam-muted">Preparing photo…</p>}
      <input
        className="fam-input"
        placeholder={`Caption, e.g. "My new school uniform!"`}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={140}
      />
      <button
        className="fam-btn"
        disabled={!blob || busy}
        onClick={() => blob && run(() => sendPhoto(householdId, memberId, blob, caption))}
      >
        {busy ? 'Sending…' : `Send to ${elder}'s TV`}
      </button>
      {preview && !busy && (
        <button className="fam-link" onClick={() => (setBlob(null), setPreview(''))}>
          Choose a different photo
        </button>
      )}
      {(error || prepError) && <p className="fam-error">{error || prepError}</p>}
    </div>
  );
}

function VoiceForm({ householdId, memberId, elder, onSent }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [micError, setMicError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>();
  const { busy, error, run } = useSend(onSent);

  const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const start = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState('done');
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setState('recording');
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch (e) {
      setMicError(e instanceof Error ? `Microphone: ${e.message}` : 'Microphone not available');
    }
  };

  const stop = () => {
    window.clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const reset = () => {
    setBlob(null);
    setUrl('');
    setState('idle');
    setSeconds(0);
  };

  return (
    <div className="fam-card">
      <h2>Send {elder} your voice</h2>
      <p className="fam-muted">Up to {MAX_SECONDS} seconds. {elder} will hear your real voice on the TV.</p>
      {!secure ? (
        <p className="fam-error">
          Voice recording needs a secure (https) link. Open NaniTV from the https address to record.
        </p>
      ) : state === 'done' && url ? (
        <>
          <audio className="fam-audio" src={url} controls />
          <button className="fam-btn" disabled={busy} onClick={() => blob && run(() => sendVoice(householdId, memberId, blob))}>
            {busy ? 'Sending…' : `Send to ${elder}'s TV`}
          </button>
          {!busy && (
            <button className="fam-link" onClick={reset}>
              Record again
            </button>
          )}
        </>
      ) : (
        <button className={`fam-rec${state === 'recording' ? ' on' : ''}`} onClick={state === 'recording' ? stop : start}>
          <span className="fam-rec-dot" />
          {state === 'recording' ? `Stop · 0:${String(seconds).padStart(2, '0')} / 0:${MAX_SECONDS}` : 'Tap to record'}
        </button>
      )}
      {(error || micError) && <p className="fam-error">{error || micError}</p>}
    </div>
  );
}

function TextForm({ householdId, memberId, elder, onSent }: Props) {
  const [text, setText] = useState('');
  const { busy, error, run } = useSend(onSent);
  return (
    <div className="fam-card">
      <h2>Write to {elder}</h2>
      <p className="fam-muted">Write normally. AI will turn it into short, simple words in {elder}'s language and the TV reads it aloud.</p>
      <textarea
        className="fam-input fam-textarea"
        placeholder="Exam went well! Coming home on Sunday, will bring your favourite mithai."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={5}
      />
      <button className="fam-btn" disabled={!text.trim() || busy} onClick={() => run(() => sendText(householdId, memberId, text.trim()))}>
        {busy ? 'Sending…' : `Send to ${elder}'s TV`}
      </button>
      {error && <p className="fam-error">{error}</p>}
    </div>
  );
}
