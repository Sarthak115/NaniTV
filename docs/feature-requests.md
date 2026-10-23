# NaniTV — Feature requests for Amazon

Format: **Request** — Why it matters for NaniTV — **Priority**

1. **A sanctioned way for companion apps to show gentle reminders over other apps** (e.g. a "care reminder" notification type the user opts into, shown as a small toast over Netflix/YouTube, with a single "Done" button).
   — Elders take medicine while watching TV. NaniTV now shows reminders over Netflix/YouTube using the legacy `SYSTEM_ALERT_WINDOW` overlay (verified on Fire OS 5), but that permission needs a runtime grant on newer Fire OS with no TV settings screen for it. A documented, opt-in API would make this reliable on every Fire TV. — **Critical**

2. **First-class Hindi / Indic text-to-speech voices on Fire TV, available to third-party apps through `TextToSpeech`.**
   — On our Fire TV Stick the default engine rejects every locale for apps, and no engine has `hi-IN`. Our Hindi messages have to be transliterated and read by an English voice. Natural Hindi (and Bengali, Tamil, Odia…) voices would make Fire TV a real accessibility channel for India's elders. — **Critical**

3. **A "web app → Fire TV" packaging tool or official template** (WebView shell with a leanback banner, Back-key bridge, console → logcat, TTS bridge, release/dev URLs).
   — Every web developer rediscovers the same five quirks (see our friction log). We open-sourced ours as `firetv-web-shell`; an official one, or a `npx create-firetv-app`, would make Fire TV the easiest TV platform to target from the web. — **Important**

4. **A self-serve Alexa+ developer preview that can point at an MCP server URL.**
   — Families should be able to ask *"Alexa, how is Nani today?"* on their own Echo. NaniTV already exposes a standards-based MCP server; the missing piece is a way for an individual developer to connect it to Alexa+. — **Important**

5. **Show the ADB authorisation state in Developer Options, and print "accept the prompt on your TV" in the CLI flow.**
   — The first `adb connect` fails with `unauthorized` and nothing says to look at the TV, which is often in another room. — **Nice-to-have**

6. **Documented per-model capability tables** (WebView version, TTS engines/locales, codecs) for each Fire TV device.
   — We had to probe `isLanguageAvailable` and `canPlayType` on the device to learn what the 2nd-gen stick supports. — **Nice-to-have**

7. **On-screen developer error overlay for WebView apps in debug builds.**
   — A JS error on Fire TV is a blank screen; a dismissible red overlay (like React Native's) would save time for every WebView developer. — **Nice-to-have**
