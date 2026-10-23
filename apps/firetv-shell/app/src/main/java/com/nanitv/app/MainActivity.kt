package com.nanitv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var bridge: NaniNativeBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this)
        webView.setBackgroundColor(0xFF3B0F1F.toInt())
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            // Mirror the page console to logcat: `adb logcat -s NaniTV`
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i(TAG, "[js] ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }

        bridge = NaniNativeBridge(this)
        webView.addJavascriptInterface(bridge, "NaniNative")

        setContentView(webView)
        hideSystemUi()

        // Debug only: `adb shell am start -n com.nanitv.app/.MainActivity --es url "http://…/tv?idle=10"`
        val override = if (BuildConfig.DEBUG) intent.getStringExtra("url") else null
        val url = override ?: BuildConfig.WEB_URL
        Log.i(TAG, "Loading $url")
        webView.loadUrl(url)
        ReminderScheduler.scheduleAll(this) // re-arm saved reminders (alarms don't survive reboots)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            // Back is handed to JS; the web app decides (and calls NaniNative.exitApp() on home).
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP) {
                    Log.i(TAG, "Back pressed -> nani-back")
                    webView.evaluateJavascript("window.dispatchEvent(new Event('nani-back'))", null)
                }
                return true
            }
            // Make sure the remote's Select reaches the page as Enter.
            KeyEvent.KEYCODE_DPAD_CENTER -> {
                val enter = KeyEvent(
                    event.downTime, event.eventTime, event.action,
                    KeyEvent.KEYCODE_ENTER, event.repeatCount, event.metaState,
                    event.deviceId, event.scanCode, event.flags, event.source,
                )
                return webView.dispatchKeyEvent(enter)
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
    }

    override fun onResume() {
        super.onResume()
        isForeground = true
        webView.onResume()
    }

    override fun onPause() {
        isForeground = false
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        bridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val TAG = "NaniTV"

        /** True while NaniTV is on screen; then the web app's own takeover handles reminders. */
        @Volatile var isForeground = false
    }
}
