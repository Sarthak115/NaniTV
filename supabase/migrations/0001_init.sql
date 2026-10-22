create extension if not exists "pgcrypto";

create table households (
  id uuid primary key default gen_random_uuid(),
  pair_code text unique not null,              -- 6 digits
  elder_name text not null default 'Nani',
  language text not null default 'hi',          -- 'hi' | 'en'
  checkin_deadline time not null default '11:00',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  relation text,                                -- 'granddaughter', 'son', ...
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  sender_id uuid references members(id) on delete set null,
  type text not null check (type in ('text','photo','voice')),
  text text,
  simplified_text text,
  media_url text,
  created_at timestamptz default now(),
  seen_at timestamptz,
  reaction text check (reaction in ('got_it','love','call_me'))
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  title text not null,
  times time[] not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table reminder_events (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid references reminders(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','taken','missed')),
  acted_at timestamptz,
  unique (reminder_id, scheduled_for)
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  kind text not null check (kind in ('ok','help','call')),
  created_at timestamptz default now()
);

create table digests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  for_date date not null,
  summary text not null,
  created_at timestamptz default now(),
  unique (household_id, for_date)
);

create index on members (household_id);
create index on messages (household_id, created_at desc);
create index on reminder_events (household_id, scheduled_for);
create index on checkins (household_id, created_at desc);

-- Realtime (households too, so the family's settings changes reach the TV live)
alter publication supabase_realtime add table households, messages, reminder_events, checkins, members, reminders;

-- Demo-grade RLS: anon can read/write. Access is scoped in the app by household_id
-- obtained via the pairing code. Documented as a known hackathon simplification.
alter table households enable row level security;
alter table members enable row level security;
alter table messages enable row level security;
alter table reminders enable row level security;
alter table reminder_events enable row level security;
alter table checkins enable row level security;
alter table digests enable row level security;
do $$ declare t text; begin
  foreach t in array array['households','members','messages','reminders','reminder_events','checkins','digests'] loop
    execute format('create policy "anon_all_%1$s" on %1$s for all to anon using (true) with check (true);', t);
  end loop;
end $$;

-- Storage: public bucket `media`, anon may upload and read.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media_anon_insert" on storage.objects
  for insert to anon with check (bucket_id = 'media');
create policy "media_anon_select" on storage.objects
  for select to anon using (bucket_id = 'media');
