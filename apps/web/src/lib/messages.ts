import { supabase } from './supabase';
import type { Member, Message, Reaction } from './types';

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** RFC4122 v4. crypto.randomUUID needs a secure context, and the LAN dev server is plain HTTP. */
export function uuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function listMessages(householdId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Message[];
}

async function upload(householdId: string, id: string, blob: Blob, ext: string): Promise<string> {
  const path = `${householdId}/${id}.${ext}`;
  const { error } = await db().storage.from('media').upload(path, blob, {
    contentType: blob.type || undefined,
    cacheControl: '31536000',
  });
  if (error) throw error;
  return db().storage.from('media').getPublicUrl(path).data.publicUrl;
}

async function insertMessage(row: Partial<Message> & { id: string; household_id: string }) {
  const { data, error } = await db().from('messages').insert(row).select('*').single();
  if (error) throw error;
  return data as Message;
}

/** Ask the edge function to rewrite the text for the elder. Never throws: the TV falls back to `text`. */
export async function simplify(messageId: string) {
  try {
    const { data, error } = await db().functions.invoke('simplify-message', { body: { message_id: messageId } });
    if (error) console.warn('simplify-message failed', error);
    return data as { simplified_text?: string } | null;
  } catch (e) {
    console.warn('simplify-message failed', e);
    return null;
  }
}

export async function sendText(householdId: string, senderId: string, text: string) {
  const msg = await insertMessage({ id: uuid(), household_id: householdId, sender_id: senderId, type: 'text', text });
  void simplify(msg.id);
  return msg;
}

export async function sendPhoto(householdId: string, senderId: string, photo: Blob, caption: string) {
  const id = uuid();
  const url = await upload(householdId, id, photo, 'jpg');
  const msg = await insertMessage({
    id,
    household_id: householdId,
    sender_id: senderId,
    type: 'photo',
    media_url: url,
    text: caption.trim() || null,
  });
  if (msg.text) void simplify(msg.id);
  return msg;
}

export async function sendVoice(householdId: string, senderId: string, audio: Blob) {
  const id = uuid();
  const ext = audio.type.includes('mp4') || audio.type.includes('aac') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  const url = await upload(householdId, id, audio, ext);
  return insertMessage({ id, household_id: householdId, sender_id: senderId, type: 'voice', media_url: url });
}

export async function markSeen(id: string) {
  await db().from('messages').update({ seen_at: new Date().toISOString() }).eq('id', id).is('seen_at', null);
}

export async function react(id: string, reaction: Reaction) {
  const { error } = await db().from('messages').update({ reaction }).eq('id', id);
  if (error) throw error;
}

/** Downscale to max 1600px JPEG on the phone before upload. */
export async function downscaleImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encode failed'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Best MediaRecorder mime type: webm/opus (Android Chrome), else mp4/aac (iOS Safari). */
export function pickAudioMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? '';
}

export const memberName = (members: Member[], id: string | null) =>
  members.find((m) => m.id === id)?.name ?? 'Family';
