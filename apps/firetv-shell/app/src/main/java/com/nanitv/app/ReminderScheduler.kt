package com.nanitv.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Native medicine-reminder scheduling, so reminders still fire when NaniTV is in the background
 * (e.g. Nani is watching Netflix). The web app hands over its reminder list via
 * NaniNative.setReminders(json); we persist it and set exact alarms for each dose time.
 *
 * Config JSON: { supabaseUrl, anonKey, householdId, timezone, language,
 *                reminders: [{ id, title, times: ["09:00:00"], active, created_at }] }
 */
object ReminderScheduler {
    private const val PREFS = "nanitv-reminders"
    private const val KEY = "config"
    const val MISSED_AFTER_MS = 30 * 60 * 1000L
    private const val TAG = MainActivity.TAG

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
        scheduleAll(ctx)
    }

    fun config(ctx: Context): JSONObject? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let {
            runCatching { JSONObject(it) }.getOrNull()
        }

    /** (Re)schedule the next occurrence of every active dose time. */
    fun scheduleAll(ctx: Context) {
        val cfg = config(ctx) ?: return
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val tz = TimeZone.getTimeZone(cfg.optString("timezone", "Asia/Kolkata"))
        val reminders = cfg.optJSONArray("reminders") ?: return
        val now = System.currentTimeMillis()
        var count = 0
        for (i in 0 until reminders.length()) {
            val r = reminders.getJSONObject(i)
            val id = r.getString("id")
            val times = r.optJSONArray("times") ?: continue
            for (j in 0 until times.length()) {
                val pi = duePendingIntent(ctx, id, j, r.optString("title"), 0L, cancelOnly = true)
                if (pi != null) am.cancel(pi)
                if (!r.optBoolean("active", true)) continue
                val at = nextOccurrence(times.getString(j), tz, now, createdAt(r))
                val intent = duePendingIntent(ctx, id, j, r.optString("title"), at, cancelOnly = false)!!
                setExact(am, at, intent)
                count++
            }
        }
        Log.i(TAG, "ReminderScheduler: scheduled $count dose alarms")
    }

    fun scheduleMissedCheck(ctx: Context, reminderId: String, title: String, scheduledFor: Long) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val i = Intent(ctx, ReminderReceiver::class.java).apply {
            action = ReminderReceiver.ACTION_MISSED
            putExtra("reminderId", reminderId)
            putExtra("title", title)
            putExtra("scheduledFor", scheduledFor)
        }
        val pi = PendingIntent.getBroadcast(ctx, ("missed$reminderId$scheduledFor").hashCode(), i, flags())
        setExact(am, scheduledFor + MISSED_AFTER_MS, pi)
    }

    private fun duePendingIntent(ctx: Context, id: String, slot: Int, title: String, at: Long, cancelOnly: Boolean): PendingIntent? {
        val i = Intent(ctx, ReminderReceiver::class.java).apply {
            action = ReminderReceiver.ACTION_DUE
            putExtra("reminderId", id)
            putExtra("title", title)
            putExtra("scheduledFor", at)
        }
        val code = ("due$id#$slot").hashCode()
        return if (cancelOnly) PendingIntent.getBroadcast(ctx, code, i, flags(noCreate = true))
        else PendingIntent.getBroadcast(ctx, code, i, flags())
    }

    private fun flags(noCreate: Boolean = false): Int {
        var f = if (noCreate) PendingIntent.FLAG_NO_CREATE else PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) f = f or PendingIntent.FLAG_IMMUTABLE
        return f
    }

    private fun setExact(am: AlarmManager, at: Long, pi: PendingIntent) {
        if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setExact(AlarmManager.RTC_WAKEUP, at, pi)
    }

    private fun createdAt(r: JSONObject): Long =
        runCatching { iso.parse(r.getString("created_at").take(19) + "Z")!!.time }.getOrDefault(0L)

    /** Next time `hhmm` (household timezone) happens after now, skipping slots before the reminder existed. */
    private fun nextOccurrence(hhmm: String, tz: TimeZone, now: Long, createdAt: Long): Long {
        val (h, m) = hhmm.split(":").let { it[0].toInt() to it[1].toInt() }
        val cal = Calendar.getInstance(tz).apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        // `<= now`: when re-arming from inside the alarm itself, today's slot has just passed
        // and must roll to tomorrow (otherwise it re-fires immediately).
        while (cal.timeInMillis <= now || cal.timeInMillis < createdAt - 60000) cal.add(Calendar.DAY_OF_MONTH, 1)
        return cal.timeInMillis
    }

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    fun isoUtc(ms: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(ms)

    // ------------------------------------------------------------- Supabase REST

    /** Create the pending event for this dose (ignored if the TV web app already made it). */
    fun ensureEvent(ctx: Context, reminderId: String, scheduledFor: Long) {
        val cfg = config(ctx) ?: return
        val body = JSONObject()
            .put("reminder_id", reminderId)
            .put("household_id", cfg.getString("householdId"))
            .put("scheduled_for", isoUtc(scheduledFor))
            .toString()
        rest(cfg, "POST", "reminder_events?on_conflict=reminder_id,scheduled_for", body, "resolution=ignore-duplicates")
    }

    /** Set a pending dose to taken/missed. */
    fun setStatus(ctx: Context, reminderId: String, scheduledFor: Long, status: String) {
        val cfg = config(ctx) ?: return
        val body = JSONObject().put("status", status).put("acted_at", isoUtc(System.currentTimeMillis())).toString()
        val filter = "reminder_id=eq.$reminderId&scheduled_for=eq.${isoUtc(scheduledFor)}&status=eq.pending"
        rest(cfg, "PATCH", "reminder_events?$filter", body, "return=minimal")
    }

    private fun rest(cfg: JSONObject, method: String, path: String, body: String, prefer: String) {
        try {
            val conn = URL("${cfg.getString("supabaseUrl")}/rest/v1/$path").openConnection() as HttpURLConnection
            conn.requestMethod = method // PATCH is supported by Android's OkHttp-backed HttpURLConnection (4.4+)
            conn.connectTimeout = 10000; conn.readTimeout = 10000
            conn.doOutput = true
            val key = cfg.getString("anonKey")
            conn.setRequestProperty("apikey", key)
            conn.setRequestProperty("Authorization", "Bearer $key")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Prefer", prefer)
            conn.outputStream.use { it.write(body.toByteArray()) }
            Log.i(TAG, "ReminderScheduler: $method ${path.substringBefore('?')} -> ${conn.responseCode}")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "ReminderScheduler: $method failed", e)
        }
    }
}
