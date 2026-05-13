package com.immobile

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class ConfigModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ConfigModule"

  override fun getConstants(): Map<String, Any> =
      mapOf(
          "API_BASE_URL" to BuildConfig.IM_MOBILE_API_BASE_URL,
          "WS_BASE_URL" to BuildConfig.IM_MOBILE_WS_BASE_URL,
          "FILE_BASE_URL" to BuildConfig.IM_MOBILE_FILE_BASE_URL,
          "IM_MOBILE_APP_ENV" to BuildConfig.IM_MOBILE_APP_ENV,
          "IM_MOBILE_RELEASE_BUILD" to BuildConfig.IM_MOBILE_RELEASE_BUILD,
      )
}
