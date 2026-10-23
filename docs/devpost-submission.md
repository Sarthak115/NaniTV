# NaniTV — Devpost submission (final text)

**Project name:** NaniTV
**Elevator pitch (≤ 200 chars):** My Nani (grandma) can't use WhatsApp, but she watches TV daily. NaniTV turns her Fire TV into a one-button family channel: messages, medicine reminders, check-ins.
**Track:** Fire TV · **Mini challenge:** Open Source

**Links**
- Code: https://github.com/sarthak115/nanitv (MIT)
- Open-source contribution: https://github.com/sarthak115/firetv-web-shell (MIT)
- Live web app: https://nanitv.vercel.app/family · Voice assistant: https://nanitv.vercel.app/assistant
- MCP server: `https://nanitv.vercel.app/api/mcp` (Streamable HTTP, protocol 2025-11-25)
- Demo video: **TODO: YouTube link**

---

## Inspiration
My *Nani* (Hindi for grandmother) lives far from most of her family. Like many grandparents in India, she isn't comfortable with smartphones: WhatsApp's tiny buttons, chats and notifications are stressful for her, and video calls only happen when someone else sets them up. But there is one screen she uses happily every single day: **the TV**.

That gave us the question behind this project: what if the family TV, controlled with nothing but the remote she already knows, became the simplest possible connection back to her children and grandchildren? And what if the same screen could also look after her: remind her about medicines, let her say "I'm OK", and call for help with one button?

## What it does
**In short:** NaniTV turns a Fire TV into a one-button family channel for elders. Grandchildren send voice notes, photos and texts from a simple phone link; they appear big on the TV, rewritten into simple Hindi and read aloud. Nani replies with one press of the remote. The TV reminds her to take her medicines, **even popping up over Netflix or YouTube** so a dose is never missed, and lets her say "I'm OK" or call for help with one button. The family gets live alerts, an AI summary of her day, and can simply *ask* an Alexa-style assistant how she's doing.

**On the TV (Nani, remote only):** three huge buttons, Hindi first: *Main theek hoon / I'm OK*, *Sandesh / Messages*, *Madad chahiye / Need help*.
- **Pairing:** the TV shows a QR code; a grandchild scans it, types their name, and the TV says *"Riya joined ❤️"*.
- **Messages from family:** a **voice note** plays the grandchild's real voice; a **photo** fills the screen with a big caption; a typed **text** is rewritten by Gemini into two short, warm sentences in Hindi and **read aloud**.
- **One-button replies:** 👍 Got it · ❤️ Love you · 📞 Call me, shown on the family's phones within a couple of seconds.
- **Medicine reminders:** at dose time the TV shows a full-screen reminder with a chime and one **✓ Taken** button. Not taken within 30 minutes → the family gets a red alert.
- **Reminders over any app (overlay):** if Nani is watching **Netflix, YouTube or any other app** at dose time, a reminder card pops up **on top of the show** with a chime and a big **✓ Taken** button that takes the remote's focus. One press of OK marks it taken for the family, and she's straight back to her show. It works even if NaniTV was closed, because the reminders are scheduled natively on the TV.
- **Daily check-in & help:** no "I'm OK" by 11:00 → the family is alerted. *Need help* (with a Yes/No confirm) alerts everyone instantly.
- **Photo frame:** when idle, the TV becomes a slideshow of family photos.
- **Hindi or English:** the family can switch the TV's language from their phone, live.

**On the phone (family, just a link):** send photos, voice notes and texts; set medicine reminders; see alerts; and tap **"Today with Nani"** for a 3–5 line AI summary of her day that leads with anything needing attention.

**Ask Alexa about Nani:** family members can simply *ask*: "How is Nani today?", "Any alerts?", "Tell Nani I'll call her at 7". Behind it is a real **MCP server** (Model Context Protocol, the open standard agentic assistants are adopting) with five tools. The assistant page is a real MCP client, and Gemini decides which tools to call. A message sent this way pops up on the Fire TV in real time.

## How we built it
- **Fire TV app:** a small Kotlin app wrapping a fullscreen WebView, with a native bridge for text-to-speech, the remote's Back key and exit. Native Android alarms plus an overlay deliver medicine reminders over other apps.
- **TV interface:** React + TypeScript designed on a fixed 1920×1080 canvas scaled to the TV, with 5% overscan margins, text no smaller than 48 px (readable from 3 m), at most 3 buttons per screen, and a tiny D-pad focus system we wrote ourselves. Chimes are generated with WebAudio, so no audio files are needed.
- **Family app:** the same React app, mobile-first; photos are downscaled on the phone, and voice notes are recorded in the browser.
- **Backend:** Supabase: Postgres, **Realtime** for instant TV ↔ phone sync, Storage for photos and voice, and Edge Functions that keep the Gemini key server-side.
- **AI:** Gemini Flash for Hindi rewriting (plus a Latin-script version the TV's English voice can read aloud), daily summaries, and function calling for the assistant.
- **MCP:** the official TypeScript SDK, protocol `2025-11-25`, Streamable HTTP, running stateless as a Vercel serverless function.
- **Hosting:** Vercel. **Total cost: ₹0**, free tiers only.
- Built solo in about 36 hours with **Claude Code** as a pair programmer. Every screen was tested on a real **2016-era Fire TV Stick (Fire OS 5)**, driven over ADB with real remote key events.

## Challenges we ran into
- **Connecting to the TV at all.** ADB over Wi-Fi kept failing with `unauthorized` until we noticed the approval prompt on the TV itself, and it reappeared whenever the laptop's ADB server restarted.
- **Making the UI work on a TV (lots of CSS!).** The WebView reports a 960-pixel-wide screen on a 1080p TV, so we scaled a fixed 1920×1080 canvas. Then a page that overflowed made the browser report the wrong width, and everything rendered zoomed in. An invisible character inserted by our Windows tooling silently broke a whole stylesheet. Emoji that look fine on a laptop render as boxes on Fire OS 5. Getting a focus ring that is *always* visible and never lost took real work.
- **The remote:** the Back key never reaches a web page in a WebView, so we forward it from Kotlin and let the page decide. We also made Back require two presses to leave the app, so Nani can't exit by accident.
- **No Hindi voice on the TV.** The stick's default speech engine refuses every language for apps (even English), and no engine has Hindi. We fall back to the built-in Pico engine, show Hindi in Devanagari on screen, and have Gemini produce a Hinglish version the English voice can read. Voice notes carry the family's real voice anyway.
- **Unreliable AI on free tiers:** our chosen Gemini model was overloaded most of the day (503s and timeouts). We built a fallback chain across current models with timeouts and a circuit breaker, cutting the assistant from **51 s to about 9 s** per question, and everything falls back gracefully so the demo never breaks.
- **Reminders while Nani watches Netflix.** We assumed Fire TV wouldn't allow apps to draw over others. We tested it on the real device instead, and it worked: native alarms plus an overlay, with the remote's OK button marking the dose taken.

## Accomplishments that we're proud of
- It runs on a **real 2016 Fire TV Stick**, not just a simulator, and every feature works with only the remote.
- An interface a grandmother can use: three buttons, Hindi first, nothing to install or learn.
- **Medicine reminders that appear over Netflix and YouTube**, answered with one press of OK.
- A real **MCP** integration end to end (server, client, function calling), with a visible "Under the hood" view of every JSON-RPC call.
- Open-sourcing our TV shell as **firetv-web-shell**, so any web app can reach Fire TV in about 5 minutes.
- A detailed **friction log** of 15 real problems and how we got past them.

## What we learned
- Designing for elders is mostly about *removing* things: one action per screen, no accidental exits, focus that never disappears, and big text.
- The WebView on Fire TV is far more capable than we expected. The gaps are in platform services (Indic voices, a documented overlay API), and a thin native layer filled them.
- With free-tier AI, robustness (fallbacks, timeouts, graceful degradation) matters as much as the prompt.
- Test on the real device early: half of our assumptions about the TV turned out to be wrong, in both directions.

## What's next for NaniTV
- **Real Alexa+:** our MCP server is ready to plug in when Alexa+ opens to independent developers, so families could say *"Alexa, how is Nani today?"* on any Echo.
- **More languages and natural voices:** Odia, Bengali and Tamil, plus natural Indic speech when Fire TV supports it.
- **Production-grade privacy:** proper per-family sign-in and access rules.
- **Reminders over any app on newer Fire TVs**, which require the overlay permission to be granted at runtime.
- Weekly health and mood summaries for the family, and gentle video calls straight from the TV.

---

## Built with (25 tags)
kotlin · android · fire-tv · fire-os · webview · react · typescript · vite · supabase · postgresql · supabase-realtime · supabase-edge-functions · deno · gemini-api · model-context-protocol · vercel · web-speech-api · webaudio · mediarecorder · zod · adb · scrcpy · elevenlabs · claude-code · node.js

## "Try it out" links
- https://nanitv.vercel.app/family
- https://nanitv.vercel.app/assistant
- https://github.com/sarthak115/nanitv
- https://github.com/sarthak115/firetv-web-shell

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
- [x] GitHub repos public with MIT `LICENSE`. **Check "About" on both repos shows the MIT license**
- [ ] **YouTube/Vimeo public video under 3 min** (`nanitv-demo-voiceover.mp4`; script: `docs/demo-script.md`)
- [x] Product feedback for every tool: `docs/product-feedback.md`
- [x] Feature requests: `docs/feature-requests.md`
- [x] Friction log (up to +10%): `docs/friction-log.md` (15 entries + seed checks)
- [ ] Submit on Devpost by **23:30 IST Fri Oct 23** (hard deadline 00:30 IST Sat Oct 24)
