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
