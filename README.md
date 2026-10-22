# NaniTV

*Nani can't use WhatsApp, but she watches TV every day.* NaniTV turns the family TV into a one-button connection between elderly parents and their children and grandchildren.

- **Elder** uses only the Fire TV remote (D-pad, Select, Back).
- **Family** uses a phone web app. There's nothing to install: open the link or scan the QR code.

> Status: Phase 1 (scaffold + Fire TV shell). This README grows phase by phase.

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

## Local development (Windows / PowerShell)

### 1. Web app
```powershell
cd apps/web
copy .env.example .env      # fill in Supabase URL + anon key (Phase 2+)
npm install
npm run dev -- --host       # serves on http://<LAN-IP>:5173
```
Allow Node through Windows Firewall on **private** networks so the TV can reach it.
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
- The tested Fire TV Stick (2nd gen, Fire OS 5) has **no Hindi TTS voice**. Hindi content relies on family voice notes and on-screen text.

## License
MIT
