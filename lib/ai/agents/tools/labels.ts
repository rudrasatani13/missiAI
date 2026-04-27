import { getToolCapability } from "@/lib/ai/agents/tools/registry"

export function getToolLabel(toolName: string): string {
  const cap = getToolCapability(toolName)
  return cap?.label ?? `Running ${toolName}`
}
