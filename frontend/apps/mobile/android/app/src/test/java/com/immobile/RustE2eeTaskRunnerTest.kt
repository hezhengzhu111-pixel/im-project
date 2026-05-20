package com.immobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class RustE2eeTaskRunnerTest {
  @Test
  fun resolveRunsBlockOnExecutorThread() {
    val executor = Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "rust-e2ee-test")
    }
    val runner = RustE2eeTaskRunner(executor) {}
    val promise = RecordingPromise()
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)

    runner.resolve(promise) {
      entered.countDown()
      release.await(2, TimeUnit.SECONDS)
      "ok"
    }

    assertTrue(entered.await(2, TimeUnit.SECONDS))
    assertEquals(0, promise.completionCount.get())

    release.countDown()

    assertTrue(promise.await())
    assertEquals("ok", promise.resolvedValue)
    assertEquals(1, promise.completionCount.get())

    runner.invalidate()
  }

  @Test
  fun invalidateRejectsQueuedTaskWithoutRunningIt() {
    val executor = Executors.newSingleThreadExecutor()
    val cleanupRan = CountDownLatch(1)
    val runner = RustE2eeTaskRunner(executor) {
      cleanupRan.countDown()
    }
    val firstPromise = RecordingPromise()
    val secondPromise = RecordingPromise()
    val firstEntered = CountDownLatch(1)
    val releaseFirst = CountDownLatch(1)
    val secondRan = AtomicBoolean(false)

    runner.resolve(firstPromise) {
      firstEntered.countDown()
      releaseFirst.await(2, TimeUnit.SECONDS)
      "first"
    }
    assertTrue(firstEntered.await(2, TimeUnit.SECONDS))

    runner.resolve(secondPromise) {
      secondRan.set(true)
      "second"
    }
    runner.invalidate()
    releaseFirst.countDown()

    assertTrue(firstPromise.await())
    assertTrue(secondPromise.await())
    assertTrue(cleanupRan.await(2, TimeUnit.SECONDS))
    assertEquals("first", firstPromise.resolvedValue)
    assertEquals("RUST_E2EE_ERROR", secondPromise.rejectedCode)
    assertTrue(secondPromise.rejectedThrowable is IllegalStateException)
    assertFalse(secondRan.get())
    assertEquals(1, secondPromise.completionCount.get())
  }

  @Test
  fun rejectsBlockFailureOnceWithMappedCode() {
    val executor = Executors.newSingleThreadExecutor()
    val runner = RustE2eeTaskRunner(executor) {}
    val promise = RecordingPromise()
    val error = IllegalArgumentException("bad input")

    runner.resolve(promise) {
      throw error
    }

    assertTrue(promise.await())
    assertEquals("RUST_E2EE_INVALID_ARGUMENT", promise.rejectedCode)
    assertSame(error, promise.rejectedThrowable)
    assertEquals(1, promise.completionCount.get())

    runner.invalidate()
  }
}

@Suppress("OVERRIDE_DEPRECATION")
private class RecordingPromise : Promise {
  val completionCount = AtomicInteger(0)
  private val completed = CountDownLatch(1)

  @Volatile
  var resolvedValue: Any? = null

  @Volatile
  var rejectedCode: String? = null

  @Volatile
  var rejectedMessage: String? = null

  @Volatile
  var rejectedThrowable: Throwable? = null

  fun await(): Boolean = completed.await(2, TimeUnit.SECONDS)

  override fun resolve(value: Any?) {
    resolvedValue = value
    completionCount.incrementAndGet()
    completed.countDown()
  }

  override fun reject(code: String?, message: String?) {
    recordReject(code, message, null)
  }

  override fun reject(code: String?, throwable: Throwable?) {
    recordReject(code, throwable?.message, throwable)
  }

  override fun reject(code: String?, message: String?, throwable: Throwable?) {
    recordReject(code, message, throwable)
  }

  override fun reject(throwable: Throwable) {
    recordReject(null, throwable.message, throwable)
  }

  override fun reject(throwable: Throwable, userInfo: WritableMap) {
    recordReject(null, throwable.message, throwable)
  }

  override fun reject(code: String?, userInfo: WritableMap) {
    recordReject(code, null, null)
  }

  override fun reject(code: String?, throwable: Throwable?, userInfo: WritableMap) {
    recordReject(code, throwable?.message, throwable)
  }

  override fun reject(code: String?, message: String?, userInfo: WritableMap) {
    recordReject(code, message, null)
  }

  override fun reject(
      code: String?,
      message: String?,
      throwable: Throwable?,
      userInfo: WritableMap?,
  ) {
    recordReject(code, message, throwable)
  }

  override fun reject(message: String) {
    recordReject(null, message, null)
  }

  private fun recordReject(code: String?, message: String?, throwable: Throwable?) {
    rejectedCode = code
    rejectedMessage = message
    rejectedThrowable = throwable
    completionCount.incrementAndGet()
    completed.countDown()
  }
}
