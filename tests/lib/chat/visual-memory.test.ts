import { describe, expect, it } from "vitest"
import {
  dataUrlToJpegFile,
  getVisualMemoryErrorMessage,
  normalizeVisualMemoryResult,
  VISUAL_MEMORY_ANALYZE_ENDPOINT,
  VISUAL_MEMORY_RESULT_TIMEOUT_MS,
} from "@/lib/chat/visual-memory"

describe("chat visual memory helpers", () => {
  it("exports the stable endpoint and result timeout", () => {
    expect(VISUAL_MEMORY_ANALYZE_ENDPOINT).toBe("/api/v1/visual-memory/analyze")
    expect(VISUAL_MEMORY_RESULT_TIMEOUT_MS).toBe(8000)
  })

  it("converts a jpeg data URL into a File payload", async () => {
    const file = dataUrlToJpegFile("data:image/jpeg;base64,aGVsbG8=")

    expect(file.name).toBe("visual-memory.jpg")
    expect(file.type).toBe("image/jpeg")
    expect(await file.text()).toBe("hello")
  })

  it("maps visual memory API errors to user-facing messages", () => {
    expect(getVisualMemoryErrorMessage(413, null)).toContain("under 5MB")
    expect(getVisualMemoryErrorMessage(415, null)).toContain("JPEG, PNG, or WebP")
    expect(getVisualMemoryErrorMessage(429, { error: "Daily limit hit" })).toBe("Daily limit hit")
    expect(getVisualMemoryErrorMessage(500, null)).toBe("Couldn't save that image. Please try again.")
  })

  it("normalizes successful visual memory payloads", () => {
    expect(normalizeVisualMemoryResult({ title: "Saved title", recallHint: "ask me later", tags: ["photo"] })).toEqual({
      title: "Saved title",
      recallHint: "ask me later",
      tags: ["photo"],
    })

    expect(normalizeVisualMemoryResult({})).toEqual({
      title: "Saved to memory",
      recallHint: "",
      tags: [],
    })
  })
})
