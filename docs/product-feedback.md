# NaniTV — Product feedback

Built solo in about a day on Windows 11, tested on a **Fire TV Stick 2nd gen (AFTT, Fire OS 5, API 22, Amazon WebView 108)**. Everything below comes from that build; the friction log (`docs/friction-log.md`) has the step-by-step details referenced as FL-n.

---

## Fire OS / Fire TV (WebView, ADB, leanback)

**What I used it for**
The TV half of NaniTV: a Kotlin single-Activity fullscreen WebView (`LEANBACK_LAUNCHER`, 320×180 banner) that loads a React app, plus a JS bridge for text-to-speech, the Back key and exit. All UI is driven by the remote's D-pad, Select and Back.

**What worked well**
- The WebView is genuinely modern even on a 2016-era stick (Chromium 108): ES modules, WebAudio, Supabase Realtime websockets, CSS transforms, `<audio>` with webm/opus and AAC all worked first time.
- D-pad arrows and Select arrive in the page as normal `keydown` events (`ArrowLeft`… / `Enter`), so web focus code just works.
- `mediaPlaybackRequiresUserGesture = false` made chimes and voice-note autoplay painless.
- Sideloading with `adb install -r` plus `adb shell input keyevent`, `screencap` and `logcat` made a tight, scriptable test loop: we tested every screen from the laptop without touching the remote.
- The leanback banner and launcher category are simple and well understood.

**What needs work**
- **TTS for third-party apps (FL-2, FL-3, FL-4).** The default engine (`com.ivona.tts.oem`) reports *every* locale unsupported, even `en-US`; we had to fall back to Pico. There is **no Hindi voice** on a device sold in India. For an accessibility product aimed at elders this was the biggest gap.
- **Back key** never reaches a WebView page (FL-5). Every WebView app has to rediscover the `dispatchKeyEvent` → `evaluateJavascript` pattern.
- **Errors are invisible on the TV.** A JS crash is a blank screen; you only see it if you mirror `console` to logcat (FL-7, FL-11).
- **ADB authorisation** shows only on the TV, with no hint in the CLI (FL-1).
- **No sanctioned way to show a gentle reminder over another app** (Netflix/YouTube). For medicine reminders this is the difference between "works while our app is open" and "works".

**Onboarding (zero → hello world)**
About 45 minutes from empty folder to our React page on the TV: Developer Options → ADB → a Kotlin WebView shell → LAN dev server. Most of that time was writing the shell and finding the Back-key and TTS quirks. We packaged the result as **firetv-web-shell** so the next person needs about 5 minutes.

**Would I build with it again?**
**Yes.** Fire TV is the one screen elderly parents in India already use every day, and a web app in a thin shell is a fast, cheap way to reach it. I'd love first-class Indic TTS and a documented "web app on Fire TV" path.

---

## Amazon Devices Builder Tools MCP

**What I used it for:** Nothing, honestly. It was in our plan as the "if stuck on device issues" escape hatch.

**What worked well / what needs work:** Can't judge it fairly. Under hackathon time pressure we answered every device question by testing directly on the stick (`adb logcat`, `screencap`, `input keyevent`). That loop was fast enough that we never reached for documentation tooling.

**Onboarding:** Not attempted.

**Would I build with it again?** **Maybe.** It would have been most valuable for the problems we solved by trial and error: which TTS engines and locales exist per Fire TV model, the Back key in WebView, and the WebView viewport behaviour (FL-12). If it can answer "what does this specific Fire TV model support?", that's the pitch I'd lead with.

---

## Supabase (Postgres, Realtime, Storage, Edge Functions)

**What I used it for**
The whole backend: 7 tables with demo-grade RLS, **Realtime** for TV ↔ phone sync (joins, messages, reactions, reminders, check-ins), **Storage** for photos and voice notes, and **Edge Functions** (Deno) to keep the Gemini key server-side (`simplify-message`, `daily-digest`, `assistant-chat`).

**What worked well**
- Realtime `postgres_changes` is the backbone of the demo: a ❤️ pressed on the TV shows on the phone in about 1–2 s, and a message sent from the phone or the MCP server pops up on the TV instantly.
- Edge Functions + `supabase secrets` = a clean, free place for API keys. `functions deploy --use-api` worked from Windows without Docker.
- A public Storage bucket with anon insert/select policies made photo and voice upload trivial.
- The anon key + RLS model let one static web app serve both the TV and the phones.

**What needs work**
- During a Supabase incident the **SQL editor hung on "Running…"** even though the migration had succeeded (FL-6). There's no server-side "last run" status.
- **Filtered Realtime channels silently drop DELETE events** (FL-10). It's documented, but a subscribe-time warning would save time.
- New-project creation in a region with an active incident is allowed, with only a small banner.

**Onboarding**
Project to working pairing flow in about 30 minutes, including the incident. The dashboard + REST made it easy to verify things from PowerShell.

**Would I build with it again?** **Yes.** Realtime + Storage + Edge Functions on a free tier covered a full-stack hackathon app without a server of my own.

---

## Gemini API

**What I used it for**
1. `simplify-message`: rewrite a family text into 2 short, warm sentences in the elder's language (Devanagari Hindi), **plus** a romanised Hinglish version so the English-only TTS voice on the stick can read it aloud.
2. `daily-digest`: a 3–5 line "Today with Nani" summary that leads with what needs attention.
3. `assistant-chat`: **function calling** over the MCP server's tool list for the "Ask Alexa about Nani" voice assistant.

**What worked well**
- The quality of the Hindi rewrites is excellent: natural, respectful, and it reliably starts with "Riya ने भेजा:". The Hinglish transliteration is accurate enough to sound right with an English voice.
- `responseMimeType: application/json` made structured output (text + tts) reliable.
- Function calling with `parametersJsonSchema` accepted the MCP tools' JSON Schemas directly. Gemini chose sensible multi-tool plans (e.g. `get_today_status` + `get_alerts`; `send_message_to_elder` + `add_reminder` from one sentence).
- `ListModels` let us discover current models at runtime.

**What needs work**
- **Availability.** The configured `gemini-3.7-flash` was overloaded for most of the day: timeouts and `503 "high demand"` (FL-8). Before our own timeouts, an Edge Function hung until the gateway's 504.
- **Model churn.** The model name from a previous project (`2.5-flash`) returned 404, and examples still use it. A stable `-latest` alias for Flash would help a lot.
- No `Retry-After` on 503.

**Onboarding:** API key to first successful call in minutes. Making it *robust* took longer: multi-model fallback, a circuit breaker, a short timeout for unproven models, and a client-side model hint. That got the assistant from 51 s to about 9 s per question.

**Would I build with it again?** **Yes**, for the Indic language quality alone, but always behind a fallback chain.

---

## Vercel

**What I used it for**
Hosting the React app (`/tv`, `/family`, `/assistant`) and, in Phase 9, the **MCP server as a serverless function** (`/api/mcp`, Streamable HTTP, stateless).

**What worked well**
- `vercel deploy --prod` from the CLI in about 30 s, with a stable `nanitv.vercel.app` alias and instant rollback.
- A Vite SPA + `api/*.ts` Node function in one project, with zero config beyond a `vercel.json` rewrite.
- The free tier was plenty.

**What needs work**
- **Env vars piped from PowerShell kept a UTF-8 BOM** (FL-11). It broke production, and the only symptom was a header error in the TV's logcat.
- CLI 65 blocks `VITE_*` values that "look like a credential" until you choose a type. Sensible, but confusing for keys that are public by design (Supabase anon).
- **Preview deployments are login-protected by default**, so machine clients (MCP) get 401. `vercel curl` worked but silently created a protection-bypass token (FL-14).
- `npx vercel` hit an `EPERM` cache lock on Windows; installing the CLI into a separate folder fixed it.

**Onboarding:** Login to a live URL in about 10 minutes, plus the BOM detour.

**Would I build with it again?** **Yes.**

---

## scrcpy

**What I used it for:** Planned for mirroring the Fire TV for the demo video. During development we used `adb exec-out screencap` / `adb shell screencap` + `pull` for screenshots (scriptable), and scrcpy for watching live.

**What worked well:** Zero setup over the same ADB-over-Wi-Fi connection; it's the easiest way to record a Fire TV for a demo video.

**What needs work:** Nothing blocking. Over Wi-Fi to a 2nd-gen stick the mirror is noticeably lower frame-rate than a capture card. For the demo we record at the stick's 1080p and keep transitions slow.

**Would I build with it again?** **Yes**, it's the default tool for showing Android TV/Fire TV work.
