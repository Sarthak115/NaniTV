# NaniTV — Build Spec for Claude Code

> Put this file in the root of the `nanitv` repo as `CLAUDE.md`. Claude Code reads it automatically every session.
> Work through the **Phases** in order. After each phase: run it, verify the acceptance criteria, commit, then continue.

---

## 0. Context & hard constraints

- **Hackathon:** Amazon "Build, Ship, Shape" Developer Hackathon (Devpost). **Track: Fire TV.** Mini challenge: **Open Source**.
- **Deadline:** Fri Oct 23, 2026, 12:00 PM PDT = **Sat Oct 24, 00:30 IST**. Target submit **23:30 IST Fri**.
- **Builder:** solo frontend dev on **Windows**, Android Studio installed. A real **Fire TV Stick (Fire OS)** is reachable over ADB at `<FIRETV_IP>:5555`. scrcpy works.
- **Budget: ₹0.** Only free tiers. No AWS. No paid APIs. No card-required services.
- **Rule that matters:** the demo video must show the app running **on the Fire TV device**. Everything must work on the real stick, not just in a desktop browser.
- **Judging (equal weight):** Tech implementation, Design (intuitive for the target device), Potential impact, Quality of idea. A friction log gives up to a **+10% bonus**.

### Working rules for Claude Code
1. Prefer **simple, working, demo-able** over clever. Ship each phase end-to-end before polishing.
2. Never put secrets in client code. The Gemini key lives only in Supabase Edge Function secrets.
3. Every TV screen must be fully usable with **only the D-pad (arrows), Select (Enter) and Back**.
4. When something is annoying, broken, or poorly documented (ADB, WebView, Fire OS quirks, Supabase, Gemini), **append an entry to `docs/friction-log.md`** using the template in §10. This is worth points.
5. Keep `README.md` setup steps accurate as you go.
6. Commit after each phase with a clear message.

---

## 1. Product

**One-liner:** *Nani can't use WhatsApp, but she watches TV every day. NaniTV turns the family TV into a one-button connection between elderly parents and their children and grandchildren.*

**Users:**
- **Elder (Nani/Nana)** uses **only the Fire TV remote**. Low tech confidence and possibly weak eyesight. Language is Hindi or English.
- **Family members** use a **phone web app** (no install, it's just a link or QR code).

### MVP features (must ship)
1. **Pairing.** The TV creates a household and shows a QR code + a 6-digit code. A family member scans it, enters a name and relation, and joins. The TV shows "Riya joined ❤️" in realtime.
2. **Family → TV messages**
   - **Photo + caption.** Full-screen photo with the caption in big text.
   - **Voice note** (≤30s, recorded in the phone browser). Plays the family member's real voice on the TV.
   - **Text.** Gemini rewrites it in short, warm, simple language **in the elder's language**. The TV shows it big and reads it aloud via native TTS.
   - New messages show a gentle chime + a banner on the TV home screen. Selecting one opens the viewer.
3. **One-button replies** on every message: `👍 Mil gaya / Got it`, `❤️ Love you`, `📞 Call me`. The reply appears instantly in the family feed.
4. **Medicine reminders.** Family creates them (title + times, e.g. "BP tablet" at 09:00 and 21:00). At that time the TV shows a full-screen takeover with a chime and narration and a single button `✓ Le liya / Taken`. If not acknowledged within **30 minutes**, the event becomes **missed** and the family app shows a red alert.
5. **Daily check-in.** The TV home has a big `Main theek hoon / I'm OK` button. If there's no check-in by the household's `checkin_deadline` (default 11:00), the family app shows an alert. `🆘 Need help` asks for a confirm (Yes/No), then alerts the family immediately.
6. **AI daily digest (family).** A button in the family app ("Today with Nani") calls Gemini to summarise today's check-ins, medicines, messages and reactions in 3–5 friendly lines.
7. **Photo frame mode.** After 2 minutes idle on the TV home, it slideshows household photos with "From Riya" captions. Any key returns home.

### Stretch (only if MVP is done and polished)
- Odia language option.
- Weekly digest.
- A test of whether an Android notification shows on Fire TV while another app is in the foreground. Document the result in the friction log and feedback either way.

### Known platform limitation (state it honestly in the README and Devpost)
Third-party apps can't draw over other apps (Netflix/YouTube) on Fire TV. NaniTV is used as the TV's companion "channel" that stays open. Reminders fire while NaniTV is open.

---

## 2. Architecture & stack

```
[Family phone browser] ──HTTPS──► [Vercel: React app /family]
                                        │
                                        ▼
                         [Supabase: Postgres + Realtime + Storage]
                                        ▲          │
                                        │          └──► [Edge Functions] ──► Gemini API (free tier)
[Fire TV: Kotlin WebView shell] ──► [Vercel: React app /tv]
          └─ JS bridge: NaniNative.speak(), back key, TTS languages
```

| Layer | Choice |
|---|---|
| Web app | React 18 + Vite + TypeScript, react-router (`/tv`, `/family/*`), plain CSS modules or Tailwind (your choice, keep it light) |
| Realtime/DB/files | Supabase free tier (`@supabase/supabase-js`) |
| AI | Gemini API via **Supabase Edge Functions** (Deno). Model from env `GEMINI_MODEL` (default: the current free-tier Flash model, e.g. `gemini-2.5-flash`; check AI Studio for the current name). |
| Fire TV app | Kotlin, single Activity, fullscreen WebView, `minSdk 22`, `targetSdk` current |
| Hosting | Vercel (free) for `apps/web` |
| QR | `qrcode.react` |
| Phone recording | `MediaRecorder` (webm/opus); fall back to mp4/aac if unsupported |
| Image upload | Downscale on the phone to max 1600px JPEG before upload |

---

## 3. Repo structure

```
nanitv/
├─ CLAUDE.md                      (this file)
├─ README.md
├─ LICENSE                        (MIT)
├─ apps/
│  ├─ web/                        React + Vite + TS
│  │  ├─ src/tv/                  TV screens + focus system
│  │  ├─ src/family/              phone screens
│  │  ├─ src/lib/                 supabase client, types, native bridge wrapper, time utils
│  │  └─ .env.example             VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│  └─ firetv-shell/               Kotlin Android project (open in Android Studio)
├─ supabase/
│  ├─ migrations/0001_init.sql
│  └─ functions/
│     ├─ simplify-message/index.ts
│     └─ daily-digest/index.ts
└─ docs/
   ├─ friction-log.md
   ├─ product-feedback.md
   ├─ feature-requests.md
   ├─ demo-script.md
   └─ devpost-submission.md
```

---

## 4. Database (supabase/migrations/0001_init.sql)

```sql
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
  created_at timestamptz default now()
);

-- Realtime
alter publication supabase_realtime add table messages, reminder_events, checkins, members;

-- Demo-grade RLS: anon can read/write. Access is scoped in the app by household_id
-- obtained via the pairing code. Document this as a known hackathon simplification.
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
```

**Storage:** create a **public** bucket `media`. Paths: `{household_id}/{message_id}.jpg|.webm`. Add a storage policy that allows anon insert and select on bucket `media`.

---

## 5. Edge functions (Gemini)

Secrets: `supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash`
Call Gemini via REST: `POST https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`. Handle CORS (OPTIONS + headers). On any Gemini error, **fall back gracefully** (return the original text, or a template digest) so the demo never breaks.

### `simplify-message`
Input: `{ message_id }`. The function loads the message, sender and household. It asks Gemini:
> You are helping an elderly grandmother read a message from her family on a TV. Rewrite the message for her in {language: Hindi in Devanagari | simple English}. Max 2 short sentences, warm and respectful, start with who sent it (e.g. "Riya ne bheja:"). No emojis except at most one heart. Message: "{text}"

It saves the result to `messages.simplified_text` and returns it. The family app calls this right after inserting a text message (and for photo captions). The TV shows `simplified_text ?? text`.

### `daily-digest`
Input: `{ household_id, date }`. Gathers that day's checkins, reminder_events (+ titles), messages (+ sender names and reactions). Prompt:
> Summarise this elderly parent's day for her family in English, 3–5 short friendly lines. Lead with anything needing attention (missed medicine, help request, "call me"). Then positives. Data: {json}

It upserts into `digests` and returns the summary.

---

## 6. Fire TV shell (apps/firetv-shell)

- Package: `com.nanitv.app`. Single `MainActivity`, fullscreen, keep the screen on.
- Manifest:
  - Intent filter with `android.intent.action.MAIN` + `android.intent.category.LEANBACK_LAUNCHER` (and `LAUNCHER`).
  - `android:banner="@drawable/banner"` (320×180 PNG: "NaniTV" wordmark, warm colors).
  - `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`
  - `<uses-feature android:name="android.software.leanback" android:required="false"/>`
  - `INTERNET` permission.
  - Debug-only cleartext traffic allowed (for the LAN dev server).
- WebView settings:
  - `javaScriptEnabled`, `domStorageEnabled`
  - `mediaPlaybackRequiresUserGesture = false` (chimes, voice notes, autoplay)
  - In debug: `WebView.setWebContentsDebuggingEnabled(true)`, so you can inspect from desktop Chrome at `chrome://inspect`.
- URL from `BuildConfig.WEB_URL`:
  - **debug:** `http://<LAPTOP_LAN_IP>:5173/tv` (read from `local.properties` key `nanitv.devUrl`)
  - **release:** `https://<vercel-app>.vercel.app/tv`
- Keys:
  - D-pad and Select already arrive in the WebView as `ArrowUp/Down/Left/Right` and `Enter`. Verify on device; if Select doesn't map to Enter, dispatch it from `dispatchKeyEvent`.
  - **Back:** override `onBackPressed` / `OnBackPressedDispatcher` → `webView.evaluateJavascript("window.dispatchEvent(new Event('nani-back'))")`. JS decides; if on the home screen, JS calls `NaniNative.exitApp()`.
- JS bridge `NaniNative` (`@JavascriptInterface`):
  - `speak(text: String, lang: String)` via Android `TextToSpeech` (`hi-IN` / `en-IN`, falling back to `en-US`)
  - `stopSpeaking()`
  - `ttsLanguages(): String` (JSON of available locales; log on startup, record in the friction log if Hindi is missing)
  - `exitApp()`
- In the web app, `src/lib/native.ts` wraps the bridge. When `window.NaniNative` is absent (desktop browser), fall back to `speechSynthesis` or a console log.

### Device loop (Windows, PowerShell)
```
fire tv ip - 192.168.1.11
adb connect <FIRETV_IP>:5555
cd apps/firetv-shell
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.nanitv.app/.MainActivity
scrcpy -s <FIRETV_IP>:5555
```
Web dev server: `npm run dev -- --host` (allow Node through Windows Firewall on private networks).

---

## 7. TV design system (apps/web/src/tv)

- Canvas **1920×1080**. Use 5% safe-area padding (overscan).
- **Min font 48px**, headings 72–96px, high contrast. Warm palette (deep blue/maroon background, cream text, saffron accent).
- **Max 3 focusable buttons per screen.** Buttons are huge (≥ 360×140px).
- Focus ring: thick (6px) saffron outline + scale 1.08 + soft glow. Focus must always be visible and never lost.
- Build a tiny focus system: `useFocusGroup(ids[])` that handles arrow keys between registered buttons and Enter to activate. Keep it generic and dependency-free; it gets extracted into the open-source repo in Phase 7.
- Bilingual labels: primary in the elder's language, secondary small in English (e.g. "Main theek hoon" / "I'm OK").
- Sounds: a short soft chime for new messages and a distinct chime for reminders (generate simple tones with the WebAudio API, no copyrighted audio).
- Clock and date always visible on home, large.

### TV screens
1. **Pairing:** Elder name, big QR code (`https://<host>/family/join?code=123456`), the 6-digit code, and a list of joined members live.
2. **Home:** greeting ("Namaste Nani 🙏" + time of day), big clock, `I'm OK` button (shows ✓ once done today), `Messages (3 new)` button, `Need help` button. Small strip showing today's medicines with status.
3. **Message viewer:** photo full-bleed, or a voice-note visual with sender name and auto-play, or the text big + auto TTS. Left/Right moves between messages. Bottom row has the 3 reply buttons. Mark `seen_at` on open.
4. **Reminder takeover:** "BP tablet ka samay ho gaya 💊", one `✓ Le liya` button, re-chime every 5 minutes until acted on or missed.
5. **Help confirm:** "Family ko bulayein? / Call family?" with `Haan` and `Nahi`.
6. **Photo frame:** idle slideshow; any key returns home.

### TV-side scheduling logic
- Every 30s: for each active reminder time today in the household timezone, ensure a `reminder_events` row exists (upsert on unique). If `now ≥ scheduled_for` and status is `pending`, show the takeover. If `now ≥ scheduled_for + 30min` and still `pending`, set it to `missed`.
- The family app derives "no check-in yet" alerts from `checkins` + `checkin_deadline`.

---

## 8. Family app (apps/web/src/family) — mobile-first

- **Join** (`/family/join?code=`): name + relation. Store `member_id` and `household_id` in localStorage.
- **Feed:** a timeline of sent messages with Nani's reactions (`❤️ Nani loved this`), check-ins, help alerts (red, at the top) and missed medicines (red). Realtime updates.
- **Send:** three big tabs (Photo / Voice / Text).
  - Photo uses camera or gallery, downscales, then uploads.
  - Voice is hold-to-record (or tap start/stop), max 30s, with a preview before sending.
  - Text: after insert, call `simplify-message`.
- **Reminders:** list, add (title + one or more times) and toggle.
- **Today with Nani:** a button that calls `daily-digest` and shows the summary card.
- **Settings:** elder name, language (hi/en), check-in deadline.

---

## 9. Phases (do in order)

### Phase 1 — Scaffold + shell on TV (target: 1h)
- Monorepo, Vite app with `/tv` and `/family` placeholder routes, Supabase client, `.env.example`.
- Kotlin shell per §6. Install on the Fire TV and load the LAN dev server.
- **Accept:** editing `/tv` text on the laptop updates on the TV after a reload. The Back key logs `nani-back` in the WebView console. `NaniNative.ttsLanguages()` result is logged.

### Phase 2 — DB + pairing (target: 1.5h)
- Apply the migration, create the `media` bucket.
- TV pairing screen + family join. Realtime member list on the TV.
- **Accept:** scanning the QR on a real phone → name entered → TV shows "Riya joined" within 2s.

### Phase 3 — Messages + replies (target: 3h)
- Family Send (photo/voice/text) with uploads. TV home banner + chime + viewer + TTS + reply buttons. Family feed shows reactions live.
- Edge function `simplify-message` deployed; the TV uses `simplified_text`.
- **Accept:** all 3 message types reach the TV and play correctly on the stick. A ❤️ press on the TV shows in the phone feed in under 2s.

### Phase 4 — Reminders, check-in, help (target: 2.5h)
- Reminder CRUD on the family side, TV scheduling + takeover + missed logic, I'm OK, Need help with confirm, family alerts.
- Add a hidden **demo helper** in family Settings: "Trigger reminder in 1 min" and "Simulate missed", so the video can be recorded without waiting.
- **Accept:** a reminder fires on the TV, Taken updates the phone, a missed one shows a red alert, and Help shows on the phone instantly.

### Phase 5 — Digest + photo frame + polish (target: 2.5h)
- `daily-digest` function + card. Idle photo frame.
- Polish: focus never lost, every screen reachable and escapable via Back, loading/empty/error states, no layout overflow at 1080p, fonts readable from 3m away.
- **Accept:** a full run-through using only the remote, with no dead ends.

### Phase 6 — Ship (target: 1.5h)
- Deploy `apps/web` to Vercel (set env vars). Release URL in the shell. Build a **release-like APK** (debug-signed is fine for sideload) that loads the hosted URL. Install and test on the stick **without the laptop dev server running**.
- README: what it is, architecture diagram, setup (Supabase, Gemini secrets, Vercel, APK build + `adb install`), known limitations, Supabase free-tier pause note.
- **Accept:** a fresh clone can follow the README end-to-end.

### Phase 7 — Open-source repo `firetv-web-shell` (target: 1h)
- A **separate public repo** (MIT): a reusable template to ship any web app to Fire TV. It contains the Kotlin WebView shell (leanback launcher, banner, Back→JS event, `speak()`/TTS bridge, debug LAN URL with live reload, release URL), plus the dependency-free `useFocusGroup` D-pad focus hook as a tiny TS module, plus a README with a 5-minute quickstart and a GIF.
- **Accept:** the README quickstart works from scratch. Note the repo URL and GitHub username for submission.

### Phase 8 — Submission docs (target: 1.5h)
- Fill `docs/product-feedback.md`, `docs/feature-requests.md`, `docs/friction-log.md`, `docs/demo-script.md` and `docs/devpost-submission.md` (templates in §10–11).

---

## 10. Doc templates

### docs/friction-log.md (each entry)
```
### FL-<n>: <short title>
- Task attempted:
- Steps taken:
- Expected:
- Actual:
- Severity: Blocker | Major | Minor
- Workaround used:
- Actionable suggestion:
```
Seed entries to verify and fill: enabling Developer Options / ADB on Fire TV; the ADB auth prompt over Wi-Fi; PG/hostel network isolation risk; WebView autoplay; D-pad Select→Enter mapping; Back key handling in WebView; Hindi TTS availability on the stick; no overlay/notification over other apps; Builder Tools MCP setup with Claude Code.

### docs/product-feedback.md (one section per tool)
For **Fire OS / Fire TV (WebView, ADB, leanback)**, **Amazon Devices Builder Tools MCP**, **Supabase**, **Gemini API**, **Vercel**, **scrcpy**:
- What I used it for
- What worked well
- What needs work
- Onboarding (zero → hello world)
- Would I build with it again? Yes/No + why

### docs/feature-requests.md
`Request — Why it matters for NaniTV — Priority (Critical/Important/Nice-to-have)`
Candidates: a sanctioned way for companion apps to show gentle reminders over other apps; first-class Hindi/Indic TTS voices on Fire TV; a web-app → Fire TV packaging tool from Amazon.

---

## 11. Demo video (under 3 min, English, real Fire TV via scrcpy + phone screen recording)
1. **0:00–0:20 Hook:** "My Nani lives alone. She can't use WhatsApp, but she watches TV every day."
2. **0:20–1:30:** Riya sends a voice note and a photo from her phone. They appear on the Fire TV with a chime. Nani presses ❤️ and it appears on the phone instantly. A text gets simplified into Hindi and read aloud.
3. **1:30–2:10:** The medicine reminder takeover → Taken. Show a missed alert on the phone. Then Need help → instant alert.
4. **2:10–2:40:** "Today with Nani" AI digest. The photo frame.
5. **2:40–3:00:** Architecture slide + open-source `firetv-web-shell`, closing line.

No copyrighted music. Lead with the strongest footage.

### docs/devpost-submission.md checklist
- [ ] Project description (what it does, how it works, built with)
- [ ] Track: **Fire TV**. Mini challenge: **Open Source** (contribution URL, repo URL, GitHub username, what/how/why)
- [ ] GitHub repo: public with an MIT LICENSE visible in About, OR private + collaborators `knmeiss, giolaq, anishamalde, mosesroth, emersonsklar` + [email protected]
- [ ] YouTube/Vimeo public video under 3 min
- [ ] Product feedback for every tool
- [ ] Feature requests (optional)
- [ ] Friction log (optional, up to +10%) — **include it**
- [ ] Submit by **23:30 IST Fri Oct 23**

---

## 12. Phase prompts (paste one at a time into Claude Code)

**P1:** "Read CLAUDE.md. Do Phase 1 completely. My Fire TV is at 192.168.1.11:5555 and my laptop LAN IP is 192.168.1.10. Give me the exact commands to build and install the shell, and stop when the acceptance criteria are met."

**P2:** "Do Phase 2. Here are my Supabase URL and anon key: <...>. Write the migration and tell me exactly how to apply it and create the media bucket (dashboard steps are fine)."

**P3:** "Do Phase 3. My Gemini key is set as a Supabase secret. Deploy the simplify-message function and give me the commands. Test all three message types on the TV."

**P4:** "Do Phase 4, including the hidden demo helper buttons."

**P5:** "Do Phase 5. Then do a D-pad-only audit of every TV screen and fix any focus traps or dead ends."

**P6:** "Do Phase 6. Deploy to Vercel, build the release APK pointing at the hosted URL, and finish the README."

**P7:** "Do Phase 7 as a separate folder ../firetv-web-shell ready to push as its own public repo."

**P8:** "Do Phase 8. Draft every doc from what we actually experienced in this build (check git history and the friction log). Keep it honest and specific."

**If stuck on device issues:** "Use the Amazon Devices Builder Tools MCP to check Fire OS / WebView best practices for <problem>, then fix it and add a friction-log entry."
