import { describe, expect, it } from "vitest"
import {
  AGENT_CONFIRM_EXECUTION_TOOL_NAMES,
  AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES,
  AGENT_DESTRUCTIVE_TOOL_NAMES,
  AGENT_SAFE_TOOL_NAMES,
  canExecuteConfirmedAgentTool,
  classifyAgentTool,
  shouldExecuteAgentPlanSequentially,
} from "@/lib/ai/agents/tools/policy"
import { getAllToolCapabilities } from "@/lib/ai/agents/tools/registry"

describe("agent-tool-policy", () => {
  it("classifies every safe tool as allowed", () => {
    for (const toolName of AGENT_SAFE_TOOL_NAMES) {
      expect(classifyAgentTool(toolName)).toEqual({ allowed: true })
    }
  })

  it("classifies every destructive tool as blocked for destructive reasons", () => {
    for (const toolName of AGENT_DESTRUCTIVE_TOOL_NAMES) {
      expect(classifyAgentTool(toolName)).toEqual({ allowed: false, reason: "destructive" })
    }
  })

  it("allows destructive confirmed-agent tools on the confirmed-agent surface", () => {
    // Dynamically find destructive tools that are allowed on the confirmed_agent surface
    const destructiveConfirmedTools = getAllToolCapabilities()
      .filter((c) => c.riskClass === "destructive" && c.allowedSurfaces.includes("confirmed_agent"))
      .map((c) => c.name)

    // Ensure we have some tools to test with
    expect(destructiveConfirmedTools.length).toBeGreaterThan(0)

    for (const toolName of destructiveConfirmedTools) {
      expect(classifyAgentTool(toolName, "confirmed_agent")).toEqual({ allowed: true })
    }
  })

  it("classifies unknown tools as blocked for unknown reasons", () => {
    expect(classifyAgentTool("notARealTool")).toEqual({ allowed: false, reason: "unknown" })
  })

  it("keeps the safe and destructive tool sets disjoint", () => {
    const overlap = [...AGENT_SAFE_TOOL_NAMES].filter((toolName) => AGENT_DESTRUCTIVE_TOOL_NAMES.has(toolName))
    expect(overlap).toEqual([])
  })

  it("allows only the shared confirmed-execution tool set", () => {
    for (const toolName of AGENT_CONFIRM_EXECUTION_TOOL_NAMES) {
      expect(canExecuteConfirmedAgentTool(toolName)).toBe(true)
    }

    // Find tools that are NOT allowed on the confirmed_agent surface
    const unconfirmedTools = getAllToolCapabilities()
      .filter((c) => !c.allowedSurfaces.includes("confirmed_agent"))
      .map((c) => c.name)

    for (const toolName of unconfirmedTools) {
      expect(canExecuteConfirmedAgentTool(toolName)).toBe(false)
    }

    expect(canExecuteConfirmedAgentTool("notARealTool")).toBe(false)
  })

  it("runs confirmed plans sequentially when a step is destructive by policy", () => {
    // Find a tool that must run sequentially
    const sequentialTool = [...AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES][0]
    expect(sequentialTool).toBeDefined()
    expect(AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES.has(sequentialTool)).toBe(true)

    expect(shouldExecuteAgentPlanSequentially([
      { toolName: sequentialTool, isDestructive: false },
    ])).toBe(true)
  })

  it("runs confirmed plans sequentially when a step is explicitly marked destructive", () => {
    // Pick any safe tool (that isn't sequential by default) to prove that `isDestructive: true` overrides it
    const parallelSafeTool = getAllToolCapabilities()
      .filter((c) => c.executionMode === "parallel" && c.riskClass === "safe")
      .map((c) => c.name)[0]

    expect(parallelSafeTool).toBeDefined()

    expect(shouldExecuteAgentPlanSequentially([
      { toolName: parallelSafeTool, isDestructive: true },
    ])).toBe(true)
  })

  it("allows parallel confirmed execution for read-only plans", () => {
    // Pick safe, parallel tools
    const parallelSafeTools = getAllToolCapabilities()
      .filter((c) => c.executionMode === "parallel" && c.riskClass === "safe")
      .map((c) => c.name)

    expect(parallelSafeTools.length).toBeGreaterThanOrEqual(2)

    expect(shouldExecuteAgentPlanSequentially([
      { toolName: parallelSafeTools[0], isDestructive: false },
      { toolName: parallelSafeTools[1], isDestructive: false },
    ])).toBe(false)
  })
})
