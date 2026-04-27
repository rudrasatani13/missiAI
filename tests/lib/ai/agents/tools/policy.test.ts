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
    expect(classifyAgentTool("createCalendarEvent", "confirmed_agent")).toEqual({ allowed: true })
    expect(classifyAgentTool("sendEmail", "confirmed_agent")).toEqual({ allowed: true })
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

    expect(canExecuteConfirmedAgentTool("searchNews")).toBe(false)
    expect(canExecuteConfirmedAgentTool("lookupContact")).toBe(false)
    expect(canExecuteConfirmedAgentTool("notARealTool")).toBe(false)
  })

  it("runs confirmed plans sequentially when a step is destructive by policy", () => {
    expect(AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES.has("createCalendarEvent")).toBe(true)

    expect(shouldExecuteAgentPlanSequentially([
      { toolName: "createCalendarEvent", isDestructive: false },
    ])).toBe(true)
  })

  it("runs confirmed plans sequentially when a step is explicitly marked destructive", () => {
    expect(shouldExecuteAgentPlanSequentially([
      { toolName: "searchMemory", isDestructive: true },
    ])).toBe(true)
  })

  it("allows parallel confirmed execution for read-only plans", () => {
    expect(shouldExecuteAgentPlanSequentially([
      { toolName: "searchMemory", isDestructive: false },
      { toolName: "searchWeb", isDestructive: false },
    ])).toBe(false)
  })
})
