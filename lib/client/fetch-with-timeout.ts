"use client"

export const CHAT_TIMEOUT = 10_000
export const STREAM_CHAT_TIMEOUT = 60_000
export const TTS_TIMEOUT = 15_000
export const STT_TIMEOUT = 10_000

/**
 * Fetch with an automatic timeout via AbortController.
 * If the caller also passes a signal, both the caller's signal and the
 * internal timeout signal are honoured — whichever fires first wins.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = CHAT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController()

  // Destructure caller's signal out of the options
  const { signal: callerSignal, ...restOptions } = options

  // If the caller already aborted, propagate immediately
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason)
    } else {
      const onCallerAbort = () => controller.abort(callerSignal.reason)
      callerSignal.addEventListener("abort", onCallerAbort, { once: true })
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...restOptions, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // If the caller aborted, re-throw the original AbortError
      if (callerSignal?.aborted) throw err
      // Otherwise it was the timeout
      throw new Error("Request timed out")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
