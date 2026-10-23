# NaniTV

*Nani can't use WhatsApp, but she watches TV every day.* NaniTV turns the family TV into a one-button connection between elderly parents and their children and grandchildren.

- **Elder** uses only the Fire TV remote (D-pad, Select, Back).
- **Family** uses a phone web app. There's nothing to install: open the link or scan the QR code.

> Status: MVP feature-complete (Phases 1–5). Deploy + release APK next.

### What it does
- **Pairing:** the TV shows a QR code + 6-digit code; family join from their phone browser and the TV says "Riya joined ❤️".
- **Family → TV:** photo + caption, voice note (≤30 s, their real voice), or text that Gemini rewrites into short, warm Hindi and the TV reads aloud. Chime + banner on arrival.
- **One-button replies:** 👍 Got it · ❤️ Love you · 📞 Call me, shown live in the family feed.
- **Medicine reminders:** full-screen takeover with chime + narration at dose time, one "✓ Le liya" button. Not taken within 30 min → the family gets a red alert.
- **Daily check-in:** "Main theek hoon / I'm OK". No check-in by the deadline (default 11:00) → family alert. "Need help" (with Yes/No confirm) alerts the family instantly.
- **AI daily digest:** "Summarise Nani's day" turns the day's check-ins, medicines, messages and replies into 3–5 lines, leading with anything that needs attention.
- **Photo frame:** after 2 minutes idle the TV slideshows family photos ("From Riya"); any key returns home.

### TV remote controls
| Screen | Left / Right | Up / Down | Select | Back |
|---|---|---|---|---|
| Home | move between *I'm OK*, *Messages*, *Need help* | — | press | press twice to exit |
| Message viewer | move between 👍 ❤️ 📞 replies | previous / next message | send reply | home |
| Help confirm | Yes / No (focus starts on No) | — | press | home |
| Medicine takeover | — | — | ✓ Taken | remind again in 5 min |
| Photo frame | any key returns home (the key isn't passed on to buttons) | | | home |

### Demo helpers
- Family app → Settings → **🎬 Demo tools**: trigger a reminder in ~1 min, simulate a missed dose.
- Debug shell only: `adb shell am start -n com.nanitv.app/.MainActivity --es url "http://<LAN-IP>:5173/tv?idle=10"` makes the photo frame start after 10 s.

## Architecture

```
[Family phone browser] ──HTTPS──► [Vercel: React app /family]
                                        │
                                        ▼
                         [Supabase: Postgres + Realtime + Storage]
                                        ▲          │
                                        │          └──► [Edge Functions] ──► Gemini API
[Fire TV: Kotlin WebView shell] ──► [Vercel: React app /tv]
          └─ JS bridge: NaniNative.speak(), Back key, TTS languages
```

| Path | What |
|---|---|
| `apps/web` | React 18 + Vite + TS. Routes `/tv` (TV UI) and `/family/*` (phone UI) |
| `apps/firetv-shell` | Kotlin single-Activity fullscreen WebView for Fire TV |
| `supabase/` | SQL migrations + Edge Functions (Gemini) |
| `docs/` | Friction log, feedback, demo script, submission |

## Try it (hosted)
- **Family app:** https://nanitv.vercel.app/family (scan the QR on the TV, or enter its 6-digit code)
- **TV app:** sideload the release APK (below). It loads https://nanitv.vercel.app/tv, so no laptop is needed.

## Local development (Windows / PowerShell)

### 0. Supabase + Gemini (free tiers)
1. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `0002_tts_text.sql`.
   This creates the tables, realtime, demo RLS policies and the public `media` bucket.
2. Get a free Gemini key at https://aistudio.google.com/apikey and set it as Edge Function secrets
   (Dashboard → Edge Functions → Secrets, or the CLI):
```powershell
npx supabase login
npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.7-flash --project-ref <ref>
npx supabase functions deploy simplify-message --project-ref <ref> --use-api
npx supabase functions deploy daily-digest --project-ref <ref> --use-api
```
If the configured model is missing, overloaded or slow, the function falls back to other current Flash models and finally to the original text, so the demo never breaks.

### 1. Web app
```powershell
cd apps/web
copy .env.example .env      # Supabase URL + anon key (Settings → API Keys)
npm install
npm run dev -- --host       # TV:     http://<LAN-IP>:5173/tv
npm run dev:phone -- --host # phones: https://<LAN-IP>:5174/family (self-signed; tap "proceed")
```
Phones need the HTTPS server because browsers only allow the microphone in a secure context.
Put `VITE_FAMILY_URL=https://<LAN-IP>:5174` in `apps/web/.env.development.local` so the TV's QR code points phones there.
Allow Node through Windows Firewall on **private** networks so the TV and phones can reach it.
Open `http://localhost:5173/tv` on the desktop. Arrow keys and Enter act as the remote, and Esc/Backspace acts as Back.

### 2. Fire TV shell
1. On the Fire TV, go to **Settings → My Fire TV → Developer Options** and turn **ADB debugging** ON.
   On newer Fire OS, first tap *About* 7 times to unlock Developer Options.
2. Copy `apps/firetv-shell/local.properties.example` to `local.properties` and set `sdk.dir` and `nanitv.devUrl` (your laptop's LAN IP).
3. Build and install:
```powershell
adb connect <FIRETV_IP>:5555          # first time: accept the prompt ON THE TV
cd apps/firetv-shell
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.nanitv.app/.MainActivity
adb logcat -s NaniTV                   # page console is mirrored here
scrcpy -s <FIRETV_IP>:5555             # optional: mirror the TV
```
- Debug builds load `nanitv.devUrl` (cleartext allowed). Release builds load `nanitv.releaseUrl` over HTTPS.
- Debug builds enable WebView remote debugging, so you can inspect the TV page from desktop Chrome at `chrome://inspect`.
- If `JAVA_HOME` points somewhere invalid, unset it. Gradle needs JDK 17+.
- Debug only: `adb shell am start -n com.nanitv.app/.MainActivity --es url "<any url>"` overrides the URL once.

### 3. Deploy (Vercel, free Hobby plan)
```powershell
cd apps/web
npx vercel login
npx vercel link --yes --project nanitv
# Use --value (not a pipe): PowerShell pipes add an invisible BOM (friction log FL-11).
npx vercel env add VITE_SUPABASE_URL --environment production --type config --value "https://<ref>.supabase.co" --yes
npx vercel env add VITE_SUPABASE_ANON_KEY --environment production --type config --value "<anon key>" --yes
npx vercel deploy --prod
```
`vercel.json` rewrites all routes to `index.html`; `.vercelignore` keeps local `.env*` files out of the upload.
The Supabase **anon** key is public by design (it ships in every Supabase web app); never put the `service_role` key here.

### 4. Release APK (loads the hosted app)
Set `nanitv.releaseUrl=https://<your-app>.vercel.app/tv` in `local.properties`, then:
```powershell
cd apps/firetv-shell
./gradlew assembleRelease            # debug-signed so it can be sideloaded
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.nanitv.app/.MainActivity
```
The release build disables cleartext traffic and WebView debugging but still mirrors the page console to `adb logcat -s NaniTV`.
The app shows up in **Settings → Applications → Manage Installed Applications** and on the Fire TV home row ("Your Apps & Channels").

### Native bridge (`window.NaniNative`)
| Method | Notes |
|---|---|
| `speak(text, lang)` | Android TextToSpeech. Falls back to the Pico engine when the default Fire OS engine can't speak English (see friction log FL-2) |
| `stopSpeaking()` | |
| `ttsLanguages()` | JSON array of usable locale tags |
| `exitApp()` | Called by the web app when Back is pressed on the home screen |

The Back key is delivered to the page as `window` event `nani-back`. The Select key arrives as `Enter`.

## Known limitations
- Third-party apps can't draw over other apps (Netflix/YouTube) on Fire TV. NaniTV is the TV's companion "channel" that stays open, and reminders fire while it's open.
- The tested Fire TV Stick (2nd gen, Fire OS 5) has **no Hindi TTS voice**. Hindi text is shown in Devanagari and read aloud as Gemini-transliterated Hinglish with the English voice; voice notes carry the family's real voice.
- **Demo-grade security:** RLS allows the anon role to read/write; access is scoped in the app by the household id obtained through the pairing code. A production version needs per-household auth (e.g. Supabase anonymous auth + RLS on `household_id`).
- **Supabase free tier pauses** projects after ~1 week of inactivity. If the TV shows "Something went wrong", restore the project from the Supabase dashboard.
- Gemini free-tier models can be overloaded (503) or slow; the functions fall back to other Flash models, then to the original text / a template digest.
- Reminders and the photo frame run while NaniTV is open; the TV must be on and on the NaniTV app.

## Alexa+ / MCP: "Ask Alexa about Nani"
Family members can ask a voice assistant *"How is Nani today?"*, *"Any alerts?"* or *"Tell Nani I'll call at 7"*. A message sent this way pops up on the Fire TV in realtime.

```
[/assistant page]  ── Web Speech API (mic) ──► question
   │  real MCP client: initialize → tools/list → tools/call   (JSON-RPC over Streamable HTTP)
   ├──────────────────────────────────────────────► [Vercel /api/mcp]  NaniTV MCP server ──► Supabase ──► Fire TV (realtime)
   └── tools + conversation ──► [Supabase edge fn assistant-chat] ──► Gemini function calling (key stays server-side)
```

- **MCP server:** `apps/web/api/mcp.ts`. Official `@modelcontextprotocol/sdk` (1.32), **protocol 2025-11-25**, Streamable HTTP, **stateless** (a fresh server + transport per POST, so it fits a serverless function). zod-validated inputs, friendly tool errors.
- **Household selection:** the TV's 6-digit pair code in the `x-nani-household` header, or `?household=123456` for clients that can't set headers.

| Tool | What it does |
|---|---|
| `get_today_status` | Check-ins, each medicine dose (taken / missed / pending / upcoming), help requests, today's messages + Nani's replies, unread count |
| `get_alerts` | Help requests, missed medicines, "Call me" replies, no "I'm OK" past the deadline |
| `send_message_to_elder(text, from_name)` | Inserts a text message (appears on the TV instantly), then runs `simplify-message` |
| `add_reminder(title, times[])` | Daily medicine reminder, 24-hour `HH:MM` times |
| `get_daily_digest(date?)` | Runs the `daily-digest` AI summary |

- **`/assistant` page** (`apps/web/src/assistant`): big mic button (Web Speech API, typed fallback), real MCP client (`src/lib/mcpClient.ts`, plain `fetch`), Gemini function calling via the `assistant-chat` edge function, spoken answers (`speechSynthesis`). It has an **Under the hood** panel with every raw JSON-RPC request/response. `/assistant?code=123456` opens a household directly.

### Connect other MCP clients
**MCP Inspector**
```bash
npx @modelcontextprotocol/inspector
```
Transport **Streamable HTTP**, URL `https://nanitv.vercel.app/api/mcp`. Under *Authentication → Custom headers* add `x-nani-household: <pair code>`, or just use `https://nanitv.vercel.app/api/mcp?household=<pair code>`. Then **Connect → Tools → List Tools → Run**.

**Claude (custom connector)**: Settings → Connectors → *Add custom connector* → URL `https://nanitv.vercel.app/api/mcp?household=<pair code>` (no OAuth). Ask Claude "How is Nani today?".

**Local development**
```bash
npm run mcp:local          # the same function on http://localhost:3333/api/mcp (Vite proxies /api to it)
npx tsx scripts/assistant-test.ts "Any alerts for Nani?"   # end-to-end: MCP client → server → Gemini
```

> **Security note (hackathon scope):** the pair code acts as a bearer secret and the server uses the public anon key. A production version would add OAuth (MCP authorization spec) and per-household RLS before connecting real assistants.

## Open source: firetv-web-shell
The Fire TV shell and the D-pad focus hook are extracted into a standalone MIT template, **[firetv-web-shell](https://github.com/sarthak115/firetv-web-shell)**. It covers the leanback banner, Back→JS, Select→Enter, a TTS bridge with the Fire OS 5 Pico fallback, debug LAN URL + release URL, `focus.ts` / `useFocusGroup.ts`, and a 5-minute quickstart verified on a Fire TV Stick.

## Docs
- [Friction log](docs/friction-log.md): 14 entries from building on a real Fire TV Stick, plus honest seed checks
- [Product feedback](docs/product-feedback.md): Fire TV, Builder Tools MCP, Supabase, Gemini, Vercel, scrcpy
- [Feature requests](docs/feature-requests.md)
- [Demo script](docs/demo-script.md) · [Devpost submission](docs/devpost-submission.md)

## License
MIT
