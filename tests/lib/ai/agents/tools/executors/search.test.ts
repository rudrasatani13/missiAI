import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"

const { geminiGenerateMock } = vi.hoisted(() => ({
  geminiGenerateMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/vertex-client", () => ({
  geminiGenerate: geminiGenerateMock,
}))

import { executeSearchTool } from "@/lib/ai/agents/tools/executors/search"

function makeCtx(): ToolContext {
  return {
    kv: null,
    vectorizeEnv: null,
    userId: "user_test123",
  }
}

describe("executeSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("applies the platform-specific query suffix for searchWeb", async () => {
    geminiGenerateMock.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "reddit results" }] } }],
    }), { status: 200 }))

    const result = await executeSearchTool({
      name: "searchWeb",
      args: { query: "typescript tips", platform: "reddit" },
    }, makeCtx())

    expect(result).not.toBeNull()
    expect(result?.status).toBe("done")
    expect(result?.output).toContain("reddit results")

    const requestBody = geminiGenerateMock.mock.calls[0][1] as {
      contents: Array<{ parts: Array<{ text: string }> }>
    }
    expect(requestBody.contents[0].parts[0].text).toContain("typescript tips site:reddit.com")
  })

  it("returns null for tool names outside the search executor", async () => {
    const result = await executeSearchTool({ name: "takeNote", args: {} }, makeCtx())
    expect(result).toBeNull()
  })
})
