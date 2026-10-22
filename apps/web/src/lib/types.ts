export type Language = 'hi' | 'en';

export interface Household {
  id: string;
  pair_code: string;
  elder_name: string;
  language: Language;
  checkin_deadline: string; // 'HH:MM:SS'
  timezone: string;
  created_at: string;
}

export interface Member {
  id: string;
  household_id: string;
  name: string;
  relation: string | null;
  created_at: string;
}

export type MessageType = 'text' | 'photo' | 'voice';
export type Reaction = 'got_it' | 'love' | 'call_me';

export interface Message {
  id: string;
  household_id: string;
  sender_id: string | null;
  type: MessageType;
  text: string | null;
  simplified_text: string | null;
  media_url: string | null;
  created_at: string;
  seen_at: string | null;
  reaction: Reaction | null;
}

export interface Reminder {
  id: string;
  household_id: string;
  title: string;
  times: string[]; // 'HH:MM:SS'
  active: boolean;
  created_at: string;
}

export interface ReminderEvent {
  id: string;
  reminder_id: string;
  household_id: string;
  scheduled_for: string;
  status: 'pending' | 'taken' | 'missed';
  acted_at: string | null;
}

export interface Checkin {
  id: string;
  household_id: string;
  kind: 'ok' | 'help' | 'call';
  created_at: string;
}
