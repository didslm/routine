package com.diarselimi.climbingroutine

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TimerServiceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "TimerService"

  @ReactMethod
  fun start(elapsedMs: Double, mode: String) {
    TimerService.start(reactContext, elapsedMs.toLong(), mode)
  }

  @ReactMethod
  fun update(elapsedMs: Double) {
    TimerService.update(reactContext, elapsedMs.toLong())
  }

  @ReactMethod
  fun setMode(mode: String) {
    TimerService.setMode(reactContext, mode)
  }

  @ReactMethod
  fun stop() {
    TimerService.stop(reactContext)
  }
}
