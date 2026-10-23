package com.nanitv.app

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Medicine reminder drawn on top of whatever app is in the foreground (Netflix, YouTube…),
 * so a dose isn't missed while NaniTV is in the background. Fire OS 5 (API 22) grants
 * SYSTEM_ALERT_WINDOW at install; the card takes remote focus so OK = "Taken", Back = later.
 */
class OverlayService : Service() {

    private var view: View? = null
    private var reminderId: String? = null
    private var scheduledFor = 0L
    private val wm by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_DISMISS) {
            if (intent.getStringExtra("reminderId") == reminderId) {
                Log.i(MainActivity.TAG, "Overlay: dose window over, hiding")
                removeView(); stopSelf()
            }
            return START_NOT_STICKY
        }
        reminderId = intent?.getStringExtra("reminderId")
        scheduledFor = intent?.getLongExtra("scheduledFor", 0L) ?: 0L
        show(intent?.getStringExtra("title") ?: "Medicine")
        return START_NOT_STICKY
    }

    @Suppress("DEPRECATION")
    private fun show(title: String) {
        removeView()
        val hindi = ReminderScheduler.config(this)?.optString("language", "hi") != "en"
        val dp = resources.displayMetrics.density
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding((32 * dp).toInt(), (24 * dp).toInt(), (32 * dp).toInt(), (24 * dp).toInt())
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F21F5A3A"))
                cornerRadius = 24 * dp
                setStroke((3 * dp).toInt(), Color.parseColor("#FF9F1C"))
            }
        }
        card.addView(TextView(this).apply {
            text = if (hindi) "$title ka samay ho gaya" else "Time for your $title"
            setTextColor(Color.parseColor("#FFF4DC"))
            textSize = 30f
            typeface = Typeface.DEFAULT_BOLD
        })
        card.addView(TextView(this).apply {
            text = if (hindi) "NaniTV · Dawai ka samay — Time for your $title" else "NaniTV · Medicine time"
            setTextColor(Color.parseColor("#E8D6B4"))
            textSize = 18f
            setPadding(0, (4 * dp).toInt(), 0, (16 * dp).toInt())
        })
        val taken = Button(this).apply {
            text = if (hindi) "✓  Le liya / Taken" else "✓  Taken"
            textSize = 26f
            isAllCaps = false
            setTextColor(Color.parseColor("#3B0F1F"))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#FF9F1C"))
                cornerRadius = 18 * dp
            }
            setPadding((44 * dp).toInt(), (14 * dp).toInt(), (44 * dp).toInt(), (14 * dp).toInt())
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener { onTaken() }
        }
        card.addView(taken)
        card.addView(TextView(this).apply {
            text = if (hindi) "Back = baad mein" else "Back = later"
            setTextColor(Color.parseColor("#E8D6B4"))
            textSize = 14f
            setPadding(0, (10 * dp).toInt(), 0, 0)
        })
        // Back hides the card (the dose stays pending; NaniTV shows it again when opened).
        taken.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                Log.i(MainActivity.TAG, "Overlay: hidden with Back")
                removeView(); stopSelf(); true
            } else false
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT, // API 22: drawn over other apps
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (40 * dp).toInt()
        }
        try {
            wm.addView(card, params)
            view = card
            taken.requestFocus()
            chime()
            Log.i(MainActivity.TAG, "Overlay: shown over foreground app for '$title'")
        } catch (e: Exception) {
            Log.e(MainActivity.TAG, "Overlay: addView failed", e)
        }
    }

    private fun onTaken() {
        Log.i(MainActivity.TAG, "Overlay: Taken pressed")
        val id = reminderId
        val at = scheduledFor
        removeView()
        if (id != null && at > 0) {
            Thread {
                ReminderScheduler.ensureEvent(this, id, at)
                ReminderScheduler.setStatus(this, id, at, "taken")
                main.post { stopSelf() }
            }.start()
        } else stopSelf()
    }

    /** Two soft beeps so it's noticed over the show's audio. */
    private fun chime() {
        runCatching {
            val tg = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
            tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 400)
            main.postDelayed({ tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 400) }, 700)
            main.postDelayed({ tg.release() }, 1600)
        }
    }

    private fun removeView() {
        view?.let { runCatching { wm.removeView(it) } }
        view = null
    }

    override fun onDestroy() {
        removeView()
        super.onDestroy()
    }

    companion object {
        const val ACTION_DISMISS = "com.nanitv.app.OVERLAY_DISMISS"
    }
}
