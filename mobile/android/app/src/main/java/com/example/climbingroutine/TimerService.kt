package com.example.climbingroutine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class TimerService : Service() {
  companion object {
    const val CHANNEL_ID = "routine_timer"
    const val NOTIFICATION_ID = 4342
    const val ACTION_START = "com.example.climbingroutine.TIMER_START"
    const val ACTION_UPDATE = "com.example.climbingroutine.TIMER_UPDATE"
    const val ACTION_STOP = "com.example.climbingroutine.TIMER_STOP"
    const val EXTRA_ELAPSED = "elapsed_ms"

    fun start(context: Context, elapsedMs: Long, mode: String) {
      val intent = Intent(context, TimerService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_ELAPSED, elapsedMs)
        putExtra("mode", mode)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun update(context: Context, elapsedMs: Long) {
      val intent = Intent(context, TimerService::class.java).apply {
        action = ACTION_UPDATE
        putExtra(EXTRA_ELAPSED, elapsedMs)
      }
      context.startService(intent)
    }

    fun setMode(context: Context, mode: String) {
      val intent = Intent(context, TimerService::class.java).apply {
        action = "com.example.climbingroutine.TIMER_MODE"
        putExtra("mode", mode)
      }
      context.startService(intent)
    }

    fun stop(context: Context) {
      val intent = Intent(context, TimerService::class.java).apply {
        action = ACTION_STOP
      }
      context.startService(intent)
    }

  }

  private var lastElapsedMs: Long = 0
  private var startTimestampMs: Long = 0
  private val handler = Handler(Looper.getMainLooper())
  private var soundPool: SoundPool? = null
  private var sound10 = 0
  private var sound30 = 0
  private var sound60 = 0
  private var mode: String = "free"
  private val tick = object : Runnable {
    override fun run() {
      val elapsed = System.currentTimeMillis() - startTimestampMs
      lastElapsedMs = elapsed
      updateNotification(elapsed)
      playTickSounds(elapsed)
      handler.postDelayed(this, 1000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        lastElapsedMs = intent.getLongExtra(EXTRA_ELAPSED, 0)
        mode = intent.getStringExtra("mode") ?: mode
        startTimestampMs = System.currentTimeMillis() - lastElapsedMs
        ensureChannel()
        ensureSounds()
        val notification = buildNotification(lastElapsedMs)
        startForeground(NOTIFICATION_ID, notification)
        handler.removeCallbacks(tick)
        handler.postDelayed(tick, 1000)
      }
      ACTION_UPDATE -> {
        lastElapsedMs = intent.getLongExtra(EXTRA_ELAPSED, lastElapsedMs)
        startTimestampMs = System.currentTimeMillis() - lastElapsedMs
        updateNotification(lastElapsedMs)
        playTickSounds(lastElapsedMs)
      }
      "com.example.climbingroutine.TIMER_MODE" -> {
        mode = intent.getStringExtra("mode") ?: mode
      }
      ACTION_STOP -> {
        handler.removeCallbacks(tick)
        releaseSounds()
        stopForeground(true)
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        updateNotification(lastElapsedMs)
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    releaseSounds()
    super.onDestroy()
  }

  private fun ensureSounds() {
    if (soundPool != null) return
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    soundPool = SoundPool.Builder()
      .setMaxStreams(2)
      .setAudioAttributes(attrs)
      .build()
    sound10 = soundPool?.load(this, R.raw.timer_10s, 1) ?: 0
    sound30 = soundPool?.load(this, R.raw.timer_30s, 1) ?: 0
    sound60 = soundPool?.load(this, R.raw.timer_60s, 1) ?: 0
  }

  private fun releaseSounds() {
    soundPool?.release()
    soundPool = null
  }

  private var lastTickSecond = -1

  private fun playTickSounds(elapsedMs: Long) {
    val seconds = (elapsedMs / 1000).toInt()
    if (seconds == lastTickSecond) return
    lastTickSecond = seconds
    if (mode == "silent") {
      if (seconds > 0 && seconds % 60 == 0) {
        vibrate(30)
      } else if (seconds > 0 && seconds % 30 == 0) {
        vibrate(20)
      } else if (seconds > 0 && seconds % 10 == 0) {
        vibrate(10)
      }
      return
    }

    val pool = soundPool ?: return
    if (mode == "free") {
      if (seconds > 0 && seconds % 60 == 0) {
        pool.play(sound60, 1f, 1f, 1, 0, 1f)
      }
      return
    }

    if (seconds > 0 && seconds % 60 == 0) {
      pool.play(sound60, 1f, 1f, 1, 0, 1f)
    } else if (seconds > 0 && seconds % 30 == 0) {
      pool.play(sound30, 1f, 1f, 1, 0, 1f)
    } else if (seconds > 0 && seconds % 10 == 0) {
      pool.play(sound10, 1f, 1f, 1, 0, 1f)
    }
  }

  private fun vibrate(durationMs: Long) {
    val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(durationMs)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Routine Timer",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Session timer"
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(elapsedMs: Long) =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Routine timer")
      .setContentText("Elapsed ${formatTime(elapsedMs)}")
      .setSmallIcon(R.drawable.ic_launcher_monochrome)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setContentIntent(mainPendingIntent())
      .build()

  private fun updateNotification(elapsedMs: Long) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification(elapsedMs))
  }

  private fun formatTime(ms: Long): String {
    val total = ms / 1000
    val m = total / 60
    val s = total % 60
    return String.format("%02d:%02d", m, s)
  }

  private fun mainPendingIntent(): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
    return PendingIntent.getActivity(this, 0, intent, flags)
  }
}
