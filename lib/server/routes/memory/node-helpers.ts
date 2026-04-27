import { z } from "zod"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import { memoryNodeIdSchema } from "@/lib/server/routes/memory/helpers"
import { sanitizeInput } from "@/lib/validation/sanitizer"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"

export const memoryNodePatchBodySchema = z.object({
  detail: z.string().max(500).transform(sanitizeInput).optional(),
  tags: z.array(z.string().max(50).transform(sanitizeInput)).max(8).optional(),
})

export type MemoryNodePatchInput = z.infer<typeof memoryNodePatchBodySchema>

export function memoryNodeJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

export type MemoryNodeAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedMemoryNodeUserId(): Promise<MemoryNodeAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }

    return {
      ok: false,
      response: memoryNodeJsonResponse({ success: false, error: "Auth error" }, 401),
    }
  }
}

export function parseMemoryNodeRouteNodeId(
  nodeId: string,
):
  | { ok: true; data: string }
  | { ok: false; response: Response } {
  const parsed = memoryNodeIdSchema.safeParse(nodeId)
  if (!parsed.success) {
    return {
      ok: false,
      response: memoryNodeJsonResponse({ success: false, error: "Invalid node ID" }, 400),
    }
  }

  return { ok: true, data: parsed.data }
}

export type MemoryNodePatchRequestResult =
  | { ok: true; data: MemoryNodePatchInput }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export async function parseMemoryNodePatchRequest(
  req: Pick<Request, "json">,
): Promise<MemoryNodePatchRequestResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: memoryNodeJsonResponse({ success: false, error: "Invalid JSON body" }, 400),
    }
  }

  const parsed = memoryNodePatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: memoryNodeJsonResponse(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Validation error",
        },
        400,
      ),
    }
  }

  return { ok: true, data: parsed.data }
}

export function getMemoryNodeKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export function getMemoryNodeVectorizeEnv(): VectorizeEnv | null {
  return getCloudflareVectorizeEnv()
}
