# NaniTV — Demo video script (target 2:50, hard limit 3:00)

**Format:** English voice-over. Two sources edited side by side or cut between:
- **TV:** the real Fire TV Stick, recorded with `scrcpy -s 192.168.1.11:5555 --record tv.mp4` (or a phone camera pointed at the TV for the opening shot).
- **Phone:** screen recording of `https://nanitv.vercel.app/family` and `/assistant` (Android: built-in screen recorder).

No music, or royalty-free only (e.g. YouTube Audio Library). Leave the TV's own chimes and voice audible: they're part of the product.

---

## Before you record (10 minutes)
1. TV: release APK running (`adb shell am start -n com.nanitv.app/.MainActivity`), on the **home screen**, language **Hindi** (family app → Settings → हिंदी) for the "simplified into Hindi" moment.
2. Phone: joined the TV as **Riya** (granddaughter). Feed open.
3. Have a nice photo ready in the phone gallery (family / food / a festival).
4. Clear distractions: phone in Do-Not-Disturb, TV volume up (chimes and TTS should be heard).
5. Rehearse once with **Settings → 🎬 Demo tools** so you know where the buttons are:
   - **Trigger a reminder in ~1 min** creates a "BP tablet" reminder for the next minute.
   - **Simulate a missed dose** creates a missed "BP tablet" alert on the phone.
6. Optional but strong: `/assistant` open in a second phone tab, already connected.

---

## Shot list

### 0:00–0:15 · Hook (TV + face/voice)
- Shot: the Fire TV home screen, big clock, "Namaste Nani 🙏".
- VO: *"My Nani lives alone. She can't use WhatsApp, but she watches TV every day. So we turned her TV into her family's channel. This is NaniTV, running on a real Fire TV Stick."*

### 0:15–0:30 · One remote, three buttons (TV)
- Press ◀ ▶ slowly so the saffron focus ring moves: **Main theek hoon / I'm OK**, **Sandesh / Messages**, **Madad chahiye / Need help**.
- VO: *"No apps to learn: three huge buttons, Hindi first, all driven by the normal Fire TV remote."*

### 0:30–1:10 · Family → TV (phone + TV, split screen)
1. Phone → **Send → Voice**: record "Nani, I passed my exam! Love you" (~4 s) → Send.
   TV: chime + banner "Riya ne aawaz sandesh bheja" → press **OK** → her real voice plays.
2. Phone → **Send → Photo**: pick the photo, caption "Diwali sweets for you!" → Send. TV: switch to it with ▼; full-screen photo + big caption.
3. Phone → **Send → Text**: "Exam went well, coming home Sunday, will bring your favourite rasgulla" → Send.
   TV: AI rewrites it into short Devanagari Hindi on screen and reads it aloud.
- VO: *"Riya sends a voice note, a photo, or just types. Gemini rewrites texts into short, warm Hindi, and the TV reads them aloud."*

### 1:10–1:25 · One-button reply (TV → phone)
- TV: on the message, press ▶ to **❤️ Love you** → OK. Toast "Riya ko bhej diya".
- Phone feed: "❤️ Nani loved this" appears within ~1–2 s.
- VO: *"Nani replies with one button. It shows up on Riya's phone instantly."*

### 1:25–1:55 · Medicine + safety (TV + phone)
1. (Pre-triggered ~1 min earlier via Demo tools.) TV: full-screen green takeover "BP tablet ka samay ho gaya" with chime + narration → press **✓ Le liya**. Phone "Today with Nani": ✅ BP tablet · taken.
2. Phone → Demo tools → **Simulate a missed dose** → feed shows the red "💊 Nani missed BP tablet" alert.
3. TV: ▶▶ to **Madad chahiye** → OK → confirm screen (focus starts on *No*) → ◀ **Haan** → OK. Phone: red "🆘 Nani pressed Need help" at the top immediately.
- VO: *"Medicine reminders take over the screen until she confirms; if she doesn't within 30 minutes, the family is alerted. And one button calls for help."*

### 1:55–2:25 · Ask Alexa about Nani (phone)
- Family app header → **🎙️ Ask Alexa** → tap the mic: *"How is Nani today?"*
  It answers aloud (help request, missed medicine, messages seen).
- Ask: *"Tell Nani I'll call her at 7 tonight."* Cut to TV: the message pops up live.
- Open **⚙️ Under the hood** for 2 seconds: the raw MCP `tools/call` JSON.
- VO: *"Family can just ask. Under the hood it's a real MCP server, the open standard agentic assistants like Alexa+ are moving to, with Gemini choosing the tools."*

### 2:25–2:40 · Daily digest + photo frame
- Phone: **✨ Summarise Nani's day with AI** → 3–5 lines appear.
- TV: leave it idle (or launch the debug build with `?idle=10`) → photo frame slideshow "Riya ki taraf se".

### 2:40–2:55 · How it's built + open source (slide)
- One slide: architecture (Fire TV Kotlin WebView shell → React on Vercel → Supabase Realtime/Storage/Edge Functions → Gemini; MCP server at `/api/mcp`).
- Second line: **github.com/sarthak115/firetv-web-shell**: "Ship any web app to Fire TV in 5 minutes" (show the GIF).
- VO: *"It's a React app in a tiny Kotlin shell, and we've open-sourced that shell so anyone can bring a web app to Fire TV."*

### 2:55–3:00 · Close
- TV home screen. VO: *"NaniTV: family, on the screen Nani already loves."*

---

## Fallbacks during recording
- **Gemini slow?** The TV shows the raw text immediately and reads the AI version when it arrives; cut the wait in editing.
- **Reminder didn't fire?** Make sure the TV is on the NaniTV app and the phone's Demo tools button said "✓". It fires within the next minute.
- **Voice note won't record?** Must be the HTTPS site (nanitv.vercel.app) in Chrome/Safari; allow the microphone.
- **Mic button greyed on /assistant?** That browser has no Web Speech API; type the question instead (still works).
