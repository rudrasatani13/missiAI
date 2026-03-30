import { z } from "zod"

// ─── Shared schemas ───────────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1, "Message content cannot be empty")
    .max(2000, "Message too long (max 2000 chars)"),
})

// ─── /api/chat ────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "At least one message is required")
    .max(20, "Too many messages (max 20)"),
  personality: z
    .enum(["bestfriend", "professional", "playful", "mentor"])
    .optional()
    .default("bestfriend"),
  memories: z
    .string()
    .max(5000, "Memory payload too large (max 5000 chars)")
    .optional()
    .default(""),
})

export type ChatInput = z.infer<typeof chatSchema>

// ─── /api/tts ─────────────────────────────────────────────────────────────────

export const ttsSchema = z.object({
  text: z
    .string()
    .min(1, "text is required")
    .max(4000, "text too long (max 4000 chars)"),
})

export type TTSInput = z.infer<typeof ttsSchema>

// ─── /api/memory POST ─────────────────────────────────────────────────────────

export const memoryPostSchema = z.object({
  conversation: z
    .array(messageSchema)
    .min(2, "Conversation must have at least 2 messages")
    .max(50, "Too many messages in conversation"),
  existingMemories: z
    .string()
    .max(5000, "Existing memories too large")
    .optional()
    .default(""),
})

export type MemoryPostInput = z.infer<typeof memoryPostSchema>

// ─── Helper: parse and return validation error ────────────────────────────────

export function validationErrorResponse(error: z.ZodError): Response {
  const firstIssue = error.issues[0]
  const message = firstIssue
    ? `Validation error: ${firstIssue.path.join(".")} — ${firstIssue.message}`
    : "Invalid request body"

  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  )
}
