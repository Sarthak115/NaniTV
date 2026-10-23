package com.nanitv.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Fires at dose time (and 30 min later for the missed check), even if NaniTV isn't running. */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("reminderId") ?: return
        val title = intent.getStringExtra("title") ?: "Medicine"
        val at = intent.getLongExtra("scheduledFor", 0L)
        val pending = goAsync()
        Thread {
            try {
                when (intent.action) {
                    ACTION_DUE -> {
                        ReminderScheduler.ensureEvent(ctx, id, at)
                        ReminderScheduler.scheduleMissedCheck(ctx, id, title, at)
                        if (MainActivity.isForeground) {
                            Log.i(MainActivity.TAG, "Reminder due: NaniTV is open, web takeover handles '$title'")
                        } else {
                            Log.i(MainActivity.TAG, "Reminder due: NaniTV in background, showing overlay for '$title'")
                            ctx.startService(Intent(ctx, OverlayService::class.java).apply {
                                putExtra("title", title)
                                putExtra("reminderId", id)
                                putExtra("scheduledFor", at)
                            })
                        }
                        ReminderScheduler.scheduleAll(ctx) // arm tomorrow's alarm for this slot
                    }
                    ACTION_MISSED -> {
                        Log.i(MainActivity.TAG, "Reminder missed check for '$title'")
                        ReminderScheduler.setStatus(ctx, id, at, "missed")
                        ctx.startService(Intent(ctx, OverlayService::class.java).apply {
                            action = OverlayService.ACTION_DISMISS
                            putExtra("reminderId", id)
                        })
                    }
                }
            } finally {
                pending.finish()
            }
        }.start()
    }

    companion object {
        const val ACTION_DUE = "com.nanitv.app.REMINDER_DUE"
        const val ACTION_MISSED = "com.nanitv.app.REMINDER_MISSED"
    }
}
