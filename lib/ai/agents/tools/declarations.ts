import { getAllToolCapabilities } from "@/lib/ai/agents/tools/registry"

/**
 * Gemini function declarations derived from the capability registry.
 * This array is injected into Gemini requests so the model can autonomously
 * decide which tools to call during a conversation.
 */
export const AGENT_FUNCTION_DECLARATIONS = getAllToolCapabilities().map((c) => ({
  name: c.name,
  description: c.description,
  parameters: c.parameters,
}))
