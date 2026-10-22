# NaniTV — Friction log

Device under test: **Fire TV Stick 2nd gen (model `AFTT`), Fire OS 5, Android API 22**, Amazon WebView `108.amazon-webview-v108-5359-tv`.
Dev machine: Windows 11, Android Studio, Java 17, Gradle 8.11.1, AGP 8.7.3.

---

### FL-1: ADB over Wi-Fi refused with "failed to authenticate" on the first connect
- Task attempted: Connect to the Fire TV over the network to sideload the shell.
- Steps taken: Developer Options → ADB debugging ON, then `adb connect 192.168.1.11:5555`.
- Expected: The device connects, or the CLI says clearly that it is waiting for approval on the TV.
- Actual: `failed to authenticate to 192.168.1.11:5555`, and `adb devices` lists the device as `unauthorized`. The RSA "Allow USB debugging?" prompt appears on the TV, which is in another room / behind the laptop, and nothing in the CLI output points you to it.
- Severity: Minor
- Workaround used: Walked to the TV, ticked "Always allow from this computer" and accepted. The second `adb devices` showed `device`.
- Actionable suggestion: Fire OS could show the pending-auth state in Settings → My Fire TV → Developer Options, and the docs could say "look at the TV now" right next to the `adb connect` step.

### FL-2: Default Fire OS TTS engine (Ivona) rejects every locale for third-party apps
- Task attempted: Read messages aloud with Android `TextToSpeech` from the WebView bridge (`NaniNative.speak`).
- Steps taken: `TextToSpeech(context, listener)` with the default engine, then `isLanguageAvailable()` for `hi-IN`, `en-IN`, `en-US` and `en-GB`.
- Expected: At least English is available on the default engine. Ideally Hindi too, for an India-focused product.
- Actual: The default engine is `com.ivona.tts.oem`. Init succeeds (`status=0`), but **every locale returns `-2` (LANG_NOT_SUPPORTED), including `en-US`**. `getAvailableLanguages()` returns empty, so there is no supported locale to `setLanguage()` to.
- Severity: Major
- Workaround used: Detect that the default engine can't speak `en-US` and re-init with the second installed engine, `com.svox.pico`. Pico reports `en-US`=1, `en-GB`=1 and `en-IN`=0 (available), but `hi-IN`=-2.
- Actionable suggestion: Expose the system (VoiceView/Ivona) voices to third-party apps through the standard `TextToSpeech` API, and document which engines and locales exist on each Fire TV model.

### FL-3: No Hindi TTS voice on the stick at all
- Task attempted: Read a Hindi (Devanagari) message to an elderly user.
- Steps taken: Probed `hi-IN` on both installed engines (Ivona OEM, Pico).
- Expected: A Hindi voice, given that Fire TV is sold in India with a Hindi UI.
- Actual: `hi-IN` is `-2` on both engines, and there is no way to install another TTS engine from the Fire TV Appstore for this device.
- Severity: Major (core accessibility feature for the target user)
- Workaround used: (Phase 3) Lean on the family's **real recorded voice notes** for Hindi. For text messages, speak a romanised/English rendering with the Pico English voice and show the Devanagari text big on screen.
- Actionable suggestion: Ship first-class Indic voices (hi-IN at minimum) on Fire TV and make them available to apps through `TextToSpeech`.

### FL-4: `TextToSpeech.getAvailableLanguages()` throws on Pico (Fire OS 5)
- Task attempted: Enumerate TTS locales to log them on startup.
- Steps taken: Called `tts.availableLanguages` after a successful init with `com.svox.pico`.
- Expected: A set of locales, or an empty set.
- Actual: An exception from inside `ITextToSpeechService$Stub$Proxy.getVoices`, because the engine doesn't implement the API-21 voices call.
- Severity: Minor
- Workaround used: Catch the exception and probe known locales with `isLanguageAvailable()`.
- Actionable suggestion: Update the bundled Pico engine, or document that the voice APIs are unsupported on Fire OS 5.

### FL-5: D-pad / Select / Back in the WebView — works, with one decision to make
- Task attempted: Drive a React page in a WebView with the Fire TV remote only.
- Steps taken: Logged `keydown` in JS, then sent `adb shell input keyevent DPAD_RIGHT/LEFT/CENTER/BACK`.
- Expected: Arrows and Select arrive as DOM key events. Back is catchable.
- Actual: Arrows arrive as `ArrowLeft/Right` (37/39) and Select arrives as `Enter` (13). **Back never reaches the page by default.** It goes to the Activity and would close the app.
- Severity: Minor
- Workaround used: Intercept `KEYCODE_BACK` in `dispatchKeyEvent` and `evaluateJavascript("window.dispatchEvent(new Event('nani-back'))")`. The page decides whether to navigate back or call `NaniNative.exitApp()`. DPAD_CENTER is also explicitly remapped to ENTER as a safety net.
- Actionable suggestion: A documented "web app on Fire TV" sample that shows this Back-key bridge pattern would save every WebView developer the same hour.

### FL-6: Supabase SQL editor stuck on "Running…" during an incident (migration had actually succeeded)
- Task attempted: Apply `0001_init.sql` in a brand-new Supabase project via the dashboard SQL editor.
- Steps taken: Created the project (Asia-Pacific; the form showed "Incident in progress" for the region), pasted the migration, clicked Run.
- Expected: A success or error result within seconds.
- Actual: The editor spun on "Running…" indefinitely, and the API Keys page also hung on "Retrieving API keys" until a hard reload. A banner said "We are investigating a technical issue".
- Severity: Major (time lost on a hackathon clock; unclear whether re-running would double-apply)
- Workaround used: Reloaded the keys page, then verified the migration from outside the dashboard with REST calls using the anon key. All 7 tables responded, and a test upload to the `media` bucket plus a public read succeeded. So the SQL had run; only the dashboard's result view was stuck.
- Actionable suggestion: Show query status from the server side (or a "check last run" link), and make the migration path via `supabase db push` more prominent for new projects.

### FL-7: Vite dependency re-optimisation breaks the page inside the Fire TV WebView ("Invalid hook call")
- Task attempted: Load the TV page after adding `qrcode.react`.
- Steps taken: Restarted `vite --host`, launched the shell.
- Expected: The page loads.
- Actual: Vite discovered a new dependency at runtime, re-bundled, and the WebView ended up with two React copies (two different `?v=` hashes), so `Cannot read properties of null (reading 'useState')` was thrown. A desktop browser auto-reloads past this. On the TV you only see a blank screen unless you are tailing `adb logcat`.
- Severity: Minor
- Workaround used: List all runtime deps in `optimizeDeps.include` and start with `vite --force` once.
- Actionable suggestion: (Vite) a louder full-reload on dep re-optimisation. (Fire TV docs) recommend mirroring `console` to logcat in WebView samples, as our shell does, since the TV gives no visual error.

### FL-8: Gemini model overloaded (503) / slow (>15s) during the build — needed multi-model fallback
- Task attempted: Rewrite family messages into short, warm Hindi with the Gemini API from a Supabase Edge Function.
- Steps taken: `GEMINI_MODEL=gemini-3.7-flash`, then `POST …:generateContent` with `responseMimeType: application/json`.
- Expected: A response in 1–3 s.
- Actual: The first call hung until our 15 s abort. The next returned `503 UNAVAILABLE: "This model is currently experiencing high demand"`. Before we added our own timeout, the Edge Function ran until Supabase's gateway returned `504` after about 150 s. We also lost time because the model name from the previous project (`2.5`) was retired, and the docs/examples still mention it.
- Severity: Major (the AI feature is the visible "magic" in the demo)
- Workaround used: `_shared/gemini.ts` tries the configured model, then asks `ListModels` for other current `*flash*` models and tries them within a 28 s budget. It caches the one that works, and the key goes in an `x-goog-api-key` header (never in the URL, so it can't leak into error strings). Thinking is turned down (`thinkingLevel: low` / `thinkingBudget: 0`). The function always falls back to the original text, and the TV reads the raw text after 2.5 s, then the AI version if it lands while the message is open. Result: `gemini-3.6-flash` answered in ~10–17 s.
- Actionable suggestion: (Gemini) Publish a stable `-latest` alias for Flash, and return a `Retry-After` hint on 503.

### FL-9: Phone microphone blocked on the LAN dev server (insecure context)
- Task attempted: Record a voice note with `MediaRecorder` on a real phone against `http://<laptop-ip>:5173`.
- Steps taken: Opened the family app from the TV's QR code.
- Expected: Mic permission prompt.
- Actual: `navigator.mediaDevices` is undefined on plain-HTTP LAN origins (only `localhost` counts as secure). `crypto.randomUUID` is missing for the same reason.
- Severity: Minor (dev only; production is HTTPS on Vercel)
- Workaround used: A second Vite server in `--mode phone` with `@vitejs/plugin-basic-ssl` on `https://<laptop-ip>:5174`. The TV keeps plain HTTP on `:5173`, and its QR code points phones to the HTTPS origin via `VITE_FAMILY_URL`. Also a `getRandomValues`-based UUID helper.
- Actionable suggestion: (Fire TV dev docs) mention this when recommending "load your LAN dev server in the WebView" for apps with a phone companion.

### FL-10: Supabase Realtime doesn't deliver DELETE events through a column filter
- Task attempted: Remove a deleted medicine reminder live on the phone and the TV.
- Steps taken: `postgres_changes` with `event: '*'` and `filter: household_id=eq.<id>` on `reminders`.
- Expected: INSERT, UPDATE and DELETE all arrive.
- Actual: INSERT/UPDATE arrive. DELETE doesn't, because the old row only carries the primary key unless `REPLICA IDENTITY FULL` is set, so the filter can't match. This is in the docs, but easy to miss.
- Severity: Minor
- Workaround used: Remove the row locally after a successful delete, and steer families to the "On/Off" toggle (an UPDATE) rather than deleting.
- Actionable suggestion: Warn at subscribe time when a filtered channel includes DELETE.

### FL-11: Vercel env vars piped from PowerShell got an invisible BOM, so the TV failed with "non ISO-8859-1 code point"
- Task attempted: Deploy the web app to Vercel with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then load it in the release Fire TV shell.
- Steps taken: `$value | vercel env add NAME production` from Windows PowerShell 5.1, then `vercel deploy --prod`.
- Expected: The values are stored exactly as typed.
- Actual: The deployed TV page showed "Something went wrong". In `adb logcat` the WebView reported `Failed to execute 'set' on 'Headers': String contains non ISO-8859-1 code point`. PowerShell had prefixed the piped value with a UTF-8 BOM (`\uFEFF`), which Vercel stored and Vite baked into the bundle. The CLI said "Removed trailing newline" but kept the BOM. Separately, CLI 65 now refuses `VITE_*` values that "look like a credential" until you choose `--type config` or `--type secret`. That's a good guard, but the Supabase *anon* key is meant to be public.
- Severity: Major (production broken, error only visible via logcat)
- Workaround used: Re-added the vars with `--value "<v>" --type config --yes` (no stdin), then redeployed with `--force`. Verified the bundle no longer contains `\uFEFF`.
- Actionable suggestion: (Vercel) Strip a leading BOM from stdin, as you already do for trailing newlines. (Fire TV) The release WebView gives no on-screen hint, so keep console→logcat mirroring even in release shells.
