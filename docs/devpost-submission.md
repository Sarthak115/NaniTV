# NaniTV — Devpost submission (draft to paste)

**Project name:** NaniTV
**Tagline (≤ 60 chars):** Turn the family Fire TV into Nani's one-button family channel
**Track:** Fire TV · **Mini challenge:** Open Source

**Links**
- Code: https://github.com/sarthak115/nanitv (MIT)
- Open-source contribution: https://github.com/sarthak115/firetv-web-shell (MIT)
- Live web app: https://nanitv.vercel.app/family · Voice assistant: https://nanitv.vercel.app/assistant
- MCP server: `https://nanitv.vercel.app/api/mcp` (Streamable HTTP, protocol 2025-11-25)
- Demo video: **TODO: YouTube link**

---

## Inspiration
My Nani lives alone. She can't use WhatsApp, and a smartphone is a constant source of stress for her. But she watches TV every day. For millions of elderly parents in India, the TV is the one screen they're comfortable with, and their children and grandchildren live in another city. We asked: what if the family TV became the simplest possible connection back to them?

## What it does
**On the Fire TV (elder, remote only):** three huge buttons, Hindi first: **Main theek hoon / I'm OK**, **Sandesh / Messages**, **Madad chahiye / Need help**.
- **Family messages** arrive with a gentle chime and banner: a **voice note** plays the grandchild's real voice; a **photo** fills the screen with a big caption; a **text** is rewritten by Gemini into two short, warm sentences in Hindi and **read aloud**.
- **One-button replies** on every message (👍 Got it · ❤️ Love you · 📞 Call me) appear on the family's phones within a couple of seconds.
- **Medicine reminders** take over the screen with a chime and narration ("BP tablet ka samay ho gaya") and a single **✓ Le liya** button. Not confirmed within 30 minutes → the family gets a red alert.
- **Reminders over any app:** if Nani is watching Netflix or YouTube at dose time, a reminder card with a big **✓ Taken** button pops up *on top of that app* and takes the remote's focus. One press of OK marks it taken for the family, and she's back to her show. (Native alarms + overlay in the Fire TV shell; verified on a Fire TV Stick running Fire OS 5.)
- **Daily check-in:** if there's no "I'm OK" by 11:00 the family is alerted; **Need help** (with a Yes/No confirm) alerts them instantly.
- **Photo frame:** when idle, the TV becomes a slideshow of family photos ("Riya ki taraf se").

**On the phone (family, no install, just a link or QR):** pair by scanning the TV's QR code, then send photos/voice/text, set medicine reminders, see alerts, and tap **✨ Today with Nani** for an AI summary of the day that leads with anything that needs attention.

**Ask Alexa about Nani (Alexa+-style):** family members can *ask*: "How is Nani today?", "Any alerts?", "Tell Nani I'll call her at 7", "Remind her to take her vitamin at 8 pm". Behind it is a real **MCP server** with five tools; the assistant page is a real MCP client, and Gemini chooses the tools via function calling. A message sent this way pops up on the Fire TV in realtime. The same MCP server works today with MCP Inspector and with Claude as a custom connector.

## How we built it
- **Fire TV app:** a Kotlin single-Activity fullscreen WebView (`LEANBACK_LAUNCHER`, banner, `minSdk 22`) with a JS bridge: native **TextToSpeech** (with a fallback engine, see below), the **Back key forwarded to JavaScript**, and exit. Sideloaded via ADB; the release APK loads the hosted app.
- **TV UI:** React 18 + Vite + TypeScript on a fixed 1920×1080 stage scaled to the WebView, 5% overscan padding, ≥ 48 px text, max 3 focusable buttons per screen, and a tiny dependency-free D-pad focus hook (`useFocusGroup`). Chimes are generated with WebAudio (no audio files).
- **Family app:** the same React app at `/family`, mobile-first; photos downscaled on the phone; voice notes via `MediaRecorder`.
- **Backend:** Supabase Postgres + **Realtime** (TV ↔ phones), Storage (photos/voice), **Edge Functions** (Deno) that keep the Gemini key server-side: `simplify-message`, `daily-digest`, `assistant-chat`.
- **AI:** Gemini Flash for Hindi rewriting (with a romanised version for the TV voice), daily digests, and function calling for the assistant, behind a multi-model fallback chain with a circuit breaker.
- **MCP:** `@modelcontextprotocol/sdk` 1.32, protocol **2025-11-25**, Streamable HTTP, **stateless** as a Vercel serverless function; zod-validated tools: `get_today_status`, `get_alerts`, `send_message_to_elder`, `add_reminder`, `get_daily_digest`.
- **Hosting:** Vercel (free). **Budget: ₹0**, free tiers only.
- Built solo in about a day with **Claude Code** as a pair programmer, testing every screen on the real stick via `adb` (`input keyevent`, `screencap`, `logcat`).

## Challenges we ran into
- **No Hindi voice on the Fire TV Stick.** The default TTS engine rejects every locale for third-party apps, even English. We detect that and fall back to Pico (English only), and have Gemini produce a Hinglish transliteration so Hindi messages can still be read aloud. Voice notes carry the family's real voice.
- **The Back key never reaches a WebView**, and JS errors on the TV are a blank screen. We forward Back as a DOM event and mirror the page console to `adb logcat`.
- **Gemini was overloaded** (503s, timeouts) on the configured model during the build. We built a fallback chain across current Flash models with timeouts, a circuit breaker and a client-side model hint, which took the assistant from 51 s to about 9 s per question.
- **Alexa+ developer tooling is partner-only**, so we built on MCP, the open standard, so it can plug in when it opens up.
- Smaller ones are all in our friction log: an invisible BOM in Vercel env vars broke production, a Vite re-optimisation left two React copies in the WebView, and Supabase's SQL editor hung during an incident.

## Accomplishments that we're proud of
- It runs on a **2016-era Fire TV Stick (Fire OS 5)**, not just an emulator. Every feature was tested on the real device with only the remote.
- An interface an 80-year-old can use: three buttons, Hindi first, nothing to install or learn.
- Real **MCP** end to end: server, client, function calling, and a visible "Under the hood" JSON-RPC log.
- Medicine reminders that **pop up over Netflix and YouTube** and are answered with the remote's OK button, which we were told wasn't possible on Fire TV until we tried it on the device.
- Turning our TV shell into a reusable **open-source template**.

## What we learned
- Designing for elders is mostly about *removing* things: one action per screen, no accidental exits (Back twice to close), focus that never disappears.
- WebView on Fire TV is far more capable than we expected; the gaps are in platform services (Indic TTS, a documented overlay API), not the web runtime. A thin native layer (alarms + an overlay) filled the overlay gap without leaving the web app.
- With free-tier AI, robustness (fallbacks, timeouts, graceful degradation) matters as much as the prompt.

## What's next for NaniTV
- Real **Alexa+** integration when tooling opens up (the MCP server is ready), and "Alexa, tell Nani…" from any Echo.
- Proper per-household auth (Supabase auth + RLS on `household_id`; OAuth for MCP).
- More Indic languages (Odia, Bengali, Tamil) and natural Indic voices when available.
- Weekly digests, and taking "reminders over any app" to newer Fire OS versions (they need the overlay permission granted at runtime).

## Built with
Kotlin · Android WebView · Fire OS · React · TypeScript · Vite · Supabase (Postgres, Realtime, Storage, Edge Functions) · Deno · Gemini API · Model Context Protocol (TypeScript SDK) · zod · Vercel · Web Speech API · WebAudio · ADB · scrcpy

---

## Open Source mini challenge
- **Contribution URL:** https://github.com/sarthak115/firetv-web-shell
- **Repo URL (project):** https://github.com/sarthak115/nanitv
- **GitHub username:** sarthak115
- **What:** `firetv-web-shell`, an MIT template to ship any web app to Fire TV: a ~250-line Kotlin WebView shell (leanback launcher + banner, Back key → JS event, Select → Enter, TTS bridge with the Fire OS 5 Pico fallback, debug LAN URL with live reload + release HTTPS URL, console → logcat) plus dependency-free D-pad focus helpers (`focus.ts` for any framework, `useFocusGroup.ts` for React) and a no-build example.
- **How:** extracted from NaniTV, generalised (app id/name/URLs from `local.properties`), and verified by cloning fresh and following the README quickstart onto a real Fire TV Stick. The README GIF is captured from that run.
- **Why:** every web developer targeting Fire TV hits the same quirks (Back never reaches the page, TTS engine surprises, invisible errors, viewport scaling). We documented each one in the template so the next person goes from web app to Fire TV in 5 minutes instead of a day.

---

## Submission checklist
- [x] Project description (above)
- [x] Track: **Fire TV** · Mini challenge: **Open Source** (contribution URL, repo URL, GitHub username, what/how/why)
- [x] GitHub repos public with MIT `LICENSE`. **Check "About" on both repos shows the MIT license** (GitHub detects it from `LICENSE`)
- [ ] **YouTube/Vimeo public video under 3 min** (script: `docs/demo-script.md`)
- [x] Product feedback for every tool: `docs/product-feedback.md`
- [x] Feature requests: `docs/feature-requests.md`
- [x] Friction log (up to +10%): `docs/friction-log.md` (15 entries + seed checks)
- [ ] Submit on Devpost by **23:30 IST Fri Oct 23** (hard deadline 00:30 IST Sat Oct 24)
