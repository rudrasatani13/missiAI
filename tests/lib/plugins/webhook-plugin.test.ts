import { describe, it, expect, vi, beforeEach } from "vitest"
import { triggerWebhook } from "@/lib/plugins/webhook-plugin"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("triggerWebhook", () => {
  const payload = { message: "hello", timestamp: Date.now(), source: "missiAI" }

  it("rejects http:// URLs and returns error without calling fetch", async () => {
    const result = await triggerWebhook("http://example.com/hook", "", "POST", payload)

    expect(result.success).toBe(false)
    expect(result.output).toBe("Only HTTPS webhooks allowed")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns success: true when fetch returns 200", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))

    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)

    expect(result.success).toBe(true)
    expect(result.output).toBe("Webhook triggered successfully")
    expect(result.pluginId).toBe("webhook")
    expect(result.action).toBe("trigger_webhook")
  })

  it("returns success: true when fetch returns 201", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 201 }))

    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)

    expect(result.success).toBe(true)
    expect(result.output).toBe("Webhook triggered successfully")
  })

  it("returns success: false with status code when fetch returns 500", async () => {
    mockFetch.mockResolvedValueOnce(new Response("error", { status: 500 }))

    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)

    expect(result.success).toBe(false)
    expect(result.output).toContain("500")
  })

  it("returns success: false with status code when fetch returns 404", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }))

    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)

    expect(result.success).toBe(false)
    expect(result.output).toContain("404")
  })

  it("includes X-Webhook-Secret header when secret is provided", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))

    await triggerWebhook("https://example.com/hook", "my-secret", "POST", payload)

    const callArgs = mockFetch.mock.calls[0]
    const options = callArgs[1] as RequestInit
    const headers = options.headers as Record<string, string>
    expect(headers["X-Webhook-Secret"]).toBe("my-secret")
  })

  it("does not include X-Webhook-Secret when secret is empty", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))

    await triggerWebhook("https://example.com/hook", "", "POST", payload)

    const callArgs = mockFetch.mock.calls[0]
    const options = callArgs[1] as RequestInit
    const headers = options.headers as Record<string, string>
    expect(headers["X-Webhook-Secret"]).toBeUndefined()
  })

  it("uses the specified HTTP method", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))

    await triggerWebhook("https://example.com/hook", "", "PUT", payload)

    const callArgs = mockFetch.mock.calls[0]
    const options = callArgs[1] as RequestInit
    expect(options.method).toBe("PUT")
  })

  it("defaults to POST when method is empty", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))

    await triggerWebhook("https://example.com/hook", "", "", payload)

    const callArgs = mockFetch.mock.calls[0]
    const options = callArgs[1] as RequestInit
    expect(options.method).toBe("POST")
  })

  it("returns timed out message when AbortController fires", async () => {
    mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        ;(options.signal as AbortSignal)?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted")
          err.name = "AbortError"
          reject(err)
        })
      })
    })

    // Replace AbortController with a class that aborts immediately
    const OriginalAbortController = globalThis.AbortController
    class ImmediateAbortController extends OriginalAbortController {
      constructor() {
        super()
        setTimeout(() => this.abort(), 0)
      }
    }
    vi.stubGlobal("AbortController", ImmediateAbortController)

    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)

    vi.stubGlobal("AbortController", OriginalAbortController)

    expect(result.success).toBe(false)
    expect(result.output).toContain("timed out")
  })

  it("has correct executedAt timestamp", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const before = Date.now()
    const result = await triggerWebhook("https://example.com/hook", "", "POST", payload)
    const after = Date.now()
    expect(result.executedAt).toBeGreaterThanOrEqual(before)
    expect(result.executedAt).toBeLessThanOrEqual(after)
  })
})
