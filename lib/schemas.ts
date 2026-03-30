import { z } from "zod"

// ─── Shared ───────────────────────────────────────────────────────────────────

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
  // memories are fetched server-side from KV — never accepted from the client
})

export type ChatInput = z.infer<typeof chatSchema>

// ─── /api/tts ─────────────────────────────────────────────────────────────────

export const ttsSchema = z.object({
  text: z
    .string()
    .min(1, "text is required")
    .max(5000, "text too long (max 5000 chars)"),
})

export type TTSInput = z.infer<typeof ttsSchema>

// ─── /api/stt ─────────────────────────────────────────────────────────────────
// FormData cannot be parsed by Zod directly. Validate the extracted File fields.

export const sttSchema = z.object({
  name: z.string().min(1, "Audio file must have a name"),
  size: z
    .number()
    .int()
    .positive("Audio file is empty")
    .max(10_000_000, "Audio file too large (max 10 MB)"),
  type: z
    .string()
    .regex(/^audio\//, "File must be an audio/* MIME type"),
})

export type STTFileInput = z.infer<typeof sttSchema>

// ─── /api/memory ──────────────────────────────────────────────────────────────
// Only the conversation is accepted from the client. userId and existingMemories
// are resolved server-side — never trusted from the request body.

export const memorySchema = z.object({
  conversation: z
    .array(messageSchema)
    .min(2, "Conversation must have at least 2 messages")
    .max(50, "Too many messages in conversation"),
})

export type MemoryInput = z.infer<typeof memorySchema>

// ─── Helper: return a 400 Response with the first Zod issue ──────────────────

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
