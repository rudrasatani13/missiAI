import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addToNotionDatabase, createNotionPage } from "@/lib/plugins/notion-plugin"

describe("notion-plugin", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns a success result with url when Notion create page returns a valid response shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ url: "https://www.notion.so/page-123" }),
    })

    await expect(createNotionPage("secret", "parent-page", "Test Page", "Body")).resolves.toEqual(
      expect.objectContaining({
        success: true,
        url: "https://www.notion.so/page-123",
      }),
    )
  })

  it("returns a failure result when Notion create page returns an invalid response shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ url: 123 }),
    })

    await expect(createNotionPage("secret", "parent-page", "Test Page", "Body")).resolves.toEqual(
      expect.objectContaining({
        success: false,
        output: "Couldn't create Notion page. Check your API key.",
      }),
    )
  })

  it("returns success and appends content when Notion database entry response is valid", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "page-123",
          url: "https://www.notion.so/page-123",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

    await expect(addToNotionDatabase("secret", "database-1", "Entry", "Body")).resolves.toEqual(
      expect.objectContaining({
        success: true,
        url: "https://www.notion.so/page-123",
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns a failure result when Notion database entry response is invalid", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: ["bad"], url: false }),
    })

    await expect(addToNotionDatabase("secret", "database-1", "Entry", "Body")).resolves.toEqual(
      expect.objectContaining({
        success: false,
        output: "Couldn't create Notion page. Check your API key.",
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
