import { describe, expect, it } from "vitest"
import { AGENT_FUNCTION_DECLARATIONS, getToolLabel } from "@/lib/ai/agents/tools/dispatcher"
import { AGENT_FUNCTION_DECLARATIONS as DECLARATIONS_FROM_MODULE } from "@/lib/ai/agents/tools/declarations"
import { getToolLabel as getToolLabelFromModule } from "@/lib/ai/agents/tools/labels"

describe("agent-tools Phase 1 static surface", () => {
  it("re-exports the shared tool declarations without changing their shape", () => {
    expect(AGENT_FUNCTION_DECLARATIONS).toBe(DECLARATIONS_FROM_MODULE)
    expect(Array.isArray(AGENT_FUNCTION_DECLARATIONS)).toBe(true)
    expect(AGENT_FUNCTION_DECLARATIONS.length).toBeGreaterThan(0)
    expect(AGENT_FUNCTION_DECLARATIONS.some((declaration) => declaration.name === "searchMemory")).toBe(true)
    expect(AGENT_FUNCTION_DECLARATIONS.some((declaration) => declaration.name === "findFreeSlot")).toBe(true)
  })

  it("re-exports the shared tool label helper without changing fallback behavior", () => {
    expect(getToolLabel).toBe(getToolLabelFromModule)
    expect(getToolLabel("searchMemory")).toBe("Searching your memory")
    expect(getToolLabel("unknownTool")).toBe("Running unknownTool")
  })
})
