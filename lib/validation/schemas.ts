import { z } from "zod"
import { API_ERROR_CODES, type ApiErrorCode } from "@/types/api"

// ─── Shared ───────────────────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1, "Message content cannot be empty")
    .max(2000, "Message too long (max 2000 chars)"),
})

// ─── /api/v1/chat ────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "At least one message is required")
    .max(20, "Too many messages (max 20)"),
  personality: z
    .enum(["bestfriend", "professional", "playful", "mentor"])
    .optional()
    .default("bestfriend"),
  maxOutputTokens: z.number().min(100).max(2000).optional(),
  memories: z.string().optional(),
})

export type ChatInput = z.infer<typeof chatSchema>

// ─── /api/v1/tts ─────────────────────────────────────────────────────────────────

export const ttsSchema = z.object({
  text: z
    .string()
    .min(1, "text is required")
    .max(5000, "text too long (max 5000 chars)"),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
})

export type TTSInput = z.infer<typeof ttsSchema>

// ─── /api/v1/stt ─────────────────────────────────────────────────────────────────
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

// ─── /api/v1/memory ──────────────────────────────────────────────────────────────
// Only the conversation is accepted from the client. userId and existingMemories
// are resolved server-side — never trusted from the request body.

export const memorySchema = z.object({
  conversation: z
    .array(messageSchema)
    .min(2, "Conversation must have at least 2 messages")
    .max(50, "Too many messages in conversation"),
  interactionCount: z.number().int().min(0).default(0),
})

export type MemoryInput = z.infer<typeof memorySchema>

// ─── /api/v1/proactive ───────────────────────────────────────────────────────

export const proactiveConfigSchema = z.object({
  enabled: z.boolean(),
  briefingTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM 24-hour format'),
  timezone: z.string().min(1, 'Timezone is required'),
  nudgesEnabled: z.boolean(),
  maxItemsPerBriefing: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5),
})

export type ProactiveConfigInput = z.infer<typeof proactiveConfigSchema>

export const nudgeRequestSchema = z.object({
  lastInteractionAt: z.number(),
})

export type NudgeRequestInput = z.infer<typeof nudgeRequestSchema>

export const dismissSchema = z.object({
  nodeId: z.string().optional(),
  type: z.string().min(1, 'type is required'),
})

export type DismissInput = z.infer<typeof dismissSchema>

// ─── Helper: return a 400 Response with the first Zod issue ──────────────────

export function validationErrorResponse(error: z.ZodError): Response {
  const firstIssue = error.issues[0]
  const message = firstIssue
    ? `Validation error: ${firstIssue.path.join(".")} — ${firstIssue.message}`
    : "Invalid request body"

  return new Response(
    JSON.stringify({ 
      success: false, 
      error: message, 
      code: API_ERROR_CODES.VALIDATION_ERROR as ApiErrorCode 
    }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  )
}
