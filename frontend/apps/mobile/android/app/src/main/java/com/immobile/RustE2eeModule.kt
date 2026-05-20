package com.immobile

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.im.e2ee.SessionException
import com.im.e2ee.SessionManager

@OptIn(ExperimentalUnsignedTypes::class)
class RustE2eeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val manager = SessionManager()

  override fun getName(): String = "RustE2eeModule"

  private fun decodeBase64(value: String): List<UByte> =
      Base64.decode(value, Base64.NO_WRAP).map { it.toUByte() }

  private fun encodeBase64(value: List<UByte>): String =
      Base64.encodeToString(value.map { it.toByte() }.toByteArray(), Base64.NO_WRAP)

  private fun toUInt(value: Double): UInt = value.toLong().toUInt()

  private inline fun resolve(promise: Promise, block: () -> Any?) {
    try {
      promise.resolve(block())
    } catch (error: Throwable) {
      val code =
          when (error) {
            is SessionException.Crypto -> "RUST_E2EE_CRYPTO"
            is SessionException.SessionNotFound -> "RUST_E2EE_SESSION_NOT_FOUND"
            is SessionException.SessionAlreadyExists -> "RUST_E2EE_SESSION_ALREADY_EXISTS"
            is SessionException.InvalidStateData -> "RUST_E2EE_INVALID_STATE"
            is IllegalArgumentException -> "RUST_E2EE_INVALID_ARGUMENT"
            else -> "RUST_E2EE_ERROR"
          }
      promise.reject(code, error.message, error)
    }
  }

  @ReactMethod
  fun generatePreKeyBundle(
      signedPreKeyId: Double,
      oneTimePreKeyStartId: Double,
      oneTimePreKeyCount: Double,
      promise: Promise,
  ) = resolve(promise) {
    manager.generatePreKeyBundle(
        toUInt(signedPreKeyId),
        toUInt(oneTimePreKeyStartId),
        toUInt(oneTimePreKeyCount),
    )
  }

  @ReactMethod
  fun createOutboundSession(
      sessionId: String,
      identityKeyPairBincodeBase64: String,
      remoteBundleJson: String,
      promise: Promise,
  ) = resolve(promise) {
    encodeBase64(
        manager.createOutboundSession(
            sessionId,
            decodeBase64(identityKeyPairBincodeBase64),
            remoteBundleJson,
        ),
    )
  }

  @ReactMethod
  fun createInboundSession(
      sessionId: String,
      identityKeyPairBincodeBase64: String,
      signedPreKeyPairBincodeBase64: String,
      oneTimePreKeyPairBincodeBase64: String?,
      remoteIdentityKeyBase64: String,
      remoteEphemeralKeyBase64: String,
      promise: Promise,
  ) = resolve(promise) {
    manager.createInboundSession(
        sessionId,
        decodeBase64(identityKeyPairBincodeBase64),
        decodeBase64(signedPreKeyPairBincodeBase64),
        oneTimePreKeyPairBincodeBase64?.let { decodeBase64(it) },
        decodeBase64(remoteIdentityKeyBase64),
        decodeBase64(remoteEphemeralKeyBase64),
    )
    null
  }

  @ReactMethod
  fun encrypt(sessionId: String, plaintextBase64: String, promise: Promise) = resolve(promise) {
    encodeBase64(manager.encrypt(sessionId, decodeBase64(plaintextBase64)))
  }

  @ReactMethod
  fun decrypt(sessionId: String, encryptedWireBase64: String, promise: Promise) = resolve(promise) {
    encodeBase64(manager.decrypt(sessionId, decodeBase64(encryptedWireBase64)))
  }

  @ReactMethod
  fun exportSession(sessionId: String, promise: Promise) = resolve(promise) {
    encodeBase64(manager.exportSession(sessionId))
  }

  @ReactMethod
  fun restoreSession(sessionId: String, stateBincodeBase64: String, promise: Promise) = resolve(promise) {
    manager.restoreSession(sessionId, decodeBase64(stateBincodeBase64))
    null
  }

  @ReactMethod
  fun removeSession(sessionId: String, promise: Promise) = resolve(promise) {
    manager.removeSession(sessionId)
    null
  }
}
