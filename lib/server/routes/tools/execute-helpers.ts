import { z } from "zod"
import { AGENT_SAFE_TOOL_NAMES, AGENT_DESTRUCTIVE_TOOL_NAMES, classifyAgentTool } from "@/lib/ai/agents/tools/policy"
import type { AgentToolCall, ToolContext } from "@/lib/ai/agents/tools/types"
import { buildAgentToolContext } from "@/lib/server/routes/agents/execution-helpers"
import { validationErrorResponse } from "@/lib/validation/schemas"
import { API_ERROR_CODES, errorResponse } from "@/types/api"

export const LIVE_SAFE_TOOL_NAMES = AGENT_SAFE_TOOL_NAMES
export const BLOCKED_FROM_LIVE = AGENT_DESTRUCTIVE_TOOL_NAMES

export const toolExecuteSchema = z.object({
  name: z.string().min(1, "Tool name required").max(50, "Tool name too long"),
  args: z.record(z.unknown()).optional().default({}),
})

export type ToolExecutePayload = z.infer<typeof toolExecuteSchema>

export type PreparedLiveToolExecution =
  | { ok: true; data: { toolCall: AgentToolCall; ctx: ToolContext } }
  | { ok: false; kind: "validation"; response: Response }
  | { ok: false; kind: "blocked" | "unknown"; toolName: string; response: Response }

export function parseToolExecutePayload(
  rawBody: unknown,
  schema: typeof toolExecuteSchema = toolExecuteSchema,
): 
  | { ok: true; data: ToolExecutePayload }
  | { ok: false; response: Response } {
  const parsed = schema.safeParse(rawBody)
  if (!parsed.success) {
    return { ok: false, response: validationErrorResponse(parsed.error) }
  }

  return { ok: true, data: parsed.data }
}

export function validateLiveToolName(
  name: string,
  safeToolNames: ReadonlySet<string> = LIVE_SAFE_TOOL_NAMES,
): 
  | { ok: true }
  | { ok: false; kind: "blocked" | "unknown"; response: Response } {
  const toolPolicy = classifyAgentTool(name, "live_execute")

  if (!toolPolicy.allowed) {
    if (toolPolicy.reason !== "destructive") {
      return {
        ok: false,
        kind: "unknown",
        response: errorResponse(
          `Unknown tool: "${name}". Available tools: ${[...safeToolNames].join(", ")}`,
          API_ERROR_CODES.VALIDATION_ERROR,
          400,
        ),
      }
    }
    return {
      ok: false,
      kind: "blocked",
      response: errorResponse(
        `Tool "${name}" requires agent confirmation and cannot be called from this endpoint.`,
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  if (!safeToolNames.has(name)) {
    return {
      ok: false,
      kind: "unknown",
      response: errorResponse(
        `Unknown tool: "${name}". Available tools: ${[...safeToolNames].join(", ")}`,
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  return { ok: true }
}

export function buildLiveToolContext(userId: string): ToolContext {
  return buildAgentToolContext(userId, { includeResendApiKey: true })
}

export function prepareLiveToolExecution(
  rawBody: unknown,
  userId: string,
): PreparedLiveToolExecution {
  const parsed = parseToolExecutePayload(rawBody)
  if (!parsed.ok) {
    return { ok: false, kind: "validation", response: parsed.response }
  }

  const { name, args } = parsed.data
  const toolValidation = validateLiveToolName(name)
  if (!toolValidation.ok) {
    return {
      ok: false,
      kind: toolValidation.kind,
      toolName: name,
      response: toolValidation.response,
    }
  }

  return {
    ok: true,
    data: {
      toolCall: { name, args },
      ctx: buildLiveToolContext(userId),
    },
  }
}

export async function prepareLiveToolExecutionRequest(
  req: Pick<Request, "json">,
  userId: string,
): Promise<PreparedLiveToolExecution> {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return {
      ok: false,
      kind: "validation",
      response: errorResponse("Invalid JSON", API_ERROR_CODES.VALIDATION_ERROR, 400),
    }
  }

  return prepareLiveToolExecution(rawBody, userId)
}
