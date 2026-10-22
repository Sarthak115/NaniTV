package com.nanitv.app

import android.app.Activity
import android.speech.tts.TextToSpeech
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONArray
import java.util.Locale

/** Exposed to the web app as `window.NaniNative`. */
class NaniNativeBridge(private val activity: Activity) {

    @Volatile private var ready = false
    @Volatile private var tts: TextToSpeech = createTts(null)

    // Fire OS 5's default engine (com.ivona.tts.oem) reports every locale as unsupported
    // to third-party apps, so if it can't speak English we fall back to Pico.
    private fun createTts(engine: String?): TextToSpeech {
        lateinit var created: TextToSpeech
        val listener = TextToSpeech.OnInitListener { status ->
            val ok = status == TextToSpeech.SUCCESS
            Log.i(TAG, "TTS init engine=${engine ?: "default"} status=$status")
            if (!ok) return@OnInitListener
            Log.i(TAG, "TTS engines: ${created.engines.joinToString { it.name }} default=${created.defaultEngine}")
            for (tag in PROBE_TAGS) {
                Log.i(TAG, "TTS[${engine ?: "default"}] isLanguageAvailable($tag) = ${created.isLanguageAvailable(Locale.forLanguageTag(tag))}")
            }
            val englishOk = created.isLanguageAvailable(Locale.US) >= TextToSpeech.LANG_AVAILABLE
            val hasPico = created.engines.any { it.name == PICO }
            if (engine == null && !englishOk && hasPico) {
                Log.w(TAG, "Default TTS engine can't speak en-US; switching to $PICO")
                created.shutdown()
                tts = createTts(PICO)
                return@OnInitListener
            }
            ready = true
            Log.i(TAG, "TTS ready, languages: ${ttsLanguages()}")
        }
        created = if (engine == null) TextToSpeech(activity.applicationContext, listener)
        else TextToSpeech(activity.applicationContext, listener, engine)
        return created
    }

    @JavascriptInterface
    fun speak(text: String, lang: String) {
        if (!ready) {
            Log.w(TAG, "speak() before TTS ready: $text")
            return
        }
        val t = tts
        val result = t.setLanguage(Locale.forLanguageTag(lang))
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "TTS locale $lang unavailable ($result), falling back to en-US")
            t.setLanguage(Locale.US)
        }
        t.setSpeechRate(0.9f)
        @Suppress("DEPRECATION")
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null)
    }

    @JavascriptInterface
    fun stopSpeaking() {
        tts.stop()
    }

    /** JSON array of locale tags the TTS engine can speak, e.g. ["en-US","hi-IN"]. */
    @JavascriptInterface
    fun ttsLanguages(): String {
        if (!ready) return "[]"
        val t = tts
        val tags = sortedSetOf<String>()
        try {
            t.availableLanguages?.forEach { tags.add(it.toLanguageTag()) }
        } catch (e: Exception) {
            // Pico on Fire OS 5 doesn't implement getVoices(); the probe below covers it.
            Log.d(TAG, "availableLanguages unsupported: ${e.javaClass.simpleName}")
        }
        // Some engines don't enumerate; probe the locales we care about directly.
        for (tag in PROBE_TAGS) {
            if (t.isLanguageAvailable(Locale.forLanguageTag(tag)) >= TextToSpeech.LANG_AVAILABLE) tags.add(tag)
        }
        return JSONArray(tags.toList()).toString()
    }

    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread { activity.finish() }
    }

    fun shutdown() {
        tts.shutdown()
    }

    companion object {
        private const val TAG = MainActivity.TAG
        private const val PICO = "com.svox.pico"
        private val PROBE_TAGS = listOf("hi-IN", "en-IN", "en-US", "en-GB")
    }
}
