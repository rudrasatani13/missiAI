import type { NextRequest } from "next/server"
import { z } from "zod"
import { API_ERROR_CODES, errorResponse } from "@/types/api"
import type { MemoryCategory } from "@/types/memory"
import { memorySchema, validationErrorResponse, type MemoryInput } from "@/lib/validation/schemas"

export const VALID_MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "person",
  "goal",
  "habit",
  "preference",
  "event",
  "emotion",
  "skill",
  "place",
  "belief",
  "relationship",
])

export type ParsedMemoryReadQuery = {
  query: string | null
  category: MemoryCategory | null
}

export function parseMemoryReadQuery(
  rawQuery: string | null,
  rawCategory: string | null,
  validCategories: ReadonlySet<string> = VALID_MEMORY_CATEGORIES,
):
  | { ok: true; data: ParsedMemoryReadQuery }
  | { ok: false; response: Response } {
  if (rawQuery !== null && rawQuery.length > 500) {
    return {
      ok: false,
      response: errorResponse(
        "Query too long (max 500 chars)",
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  if (rawCategory !== null && !validCategories.has(rawCategory)) {
    return {
      ok: false,
      response: errorResponse(
        "Invalid category",
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  return {
    ok: true,
    data: {
      query: rawQuery,
      category: (rawCategory as MemoryCategory | null) ?? null,
    },
  }
}

export const memoryNodeIdSchema = z.string().min(1).max(50)

export type ParsedMemoryWriteRequest =
  | { ok: true; data: MemoryInput }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export async function parseMemoryWriteRequest(
  req: Pick<NextRequest, "json">,
): Promise<ParsedMemoryWriteRequest> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: errorResponse(
        "Invalid JSON body",
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  const parsed = memorySchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: validationErrorResponse(parsed.error),
    }
  }

  return { ok: true, data: parsed.data }
}

export async function resolveMemoryDeleteNodeId(
  req: Pick<NextRequest, "json" | "nextUrl">,
): Promise<string | null> {
  const nodeId = req.nextUrl.searchParams.get("nodeId")
  if (nodeId) return nodeId

  try {
    const body = await req.json() as { nodeId?: unknown }
    return typeof body?.nodeId === "string" ? body.nodeId : null
  } catch {
    return null
  }
}

export function validateMemoryDeleteNodeId(
  nodeId: string | null,
  schema: z.ZodString = memoryNodeIdSchema,
):
  | { ok: true; data: string }
  | { ok: false; response: Response } {
  if (!nodeId) {
    return {
      ok: false,
      response: errorResponse(
        "nodeId is required",
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  const parsed = schema.safeParse(nodeId)
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(
        "Invalid node ID",
        API_ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    }
  }

  return { ok: true, data: parsed.data }
}
