import { z } from "zod"
import { API_ERROR_CODES, type ApiErrorCode } from "@/types/api"
import { sanitizeInput } from "./sanitizer"

// ─── Shared ───────────────────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1, "Message content cannot be empty")
    .max(2000, "Message too long (max 2000 chars)")
    .transform(sanitizeInput),
  image: z.string().optional(),
})

// ─── /api/v1/chat ────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "At least one message is required")
    .max(20, "Too many messages (max 20)"),
  personality: z
    .enum(["assistant", "bestfriend", "professional", "playful", "mentor", "custom"])
    .optional()
    .default("assistant"),
  customPrompt: z.string().max(2000, "Custom prompt too long").transform(sanitizeInput).optional(),
  maxOutputTokens: z.number().min(100).max(2000).optional(),
  memories: z.string().max(10000, "Memories payload too large").transform(sanitizeInput).optional(),
  voiceEnabled: z.boolean().optional(),
  /** When true, enables EDITH autonomous agent mode — voice-first, no typing */
  voiceMode: z.boolean().optional(),
  /** Client-reported recording duration in milliseconds (server clamps to 3–120s) */
  voiceDurationMs: z.number().min(0).max(300000).optional(),
})

export type ChatInput = z.infer<typeof chatSchema>

// ─── /api/v1/tts ─────────────────────────────────────────────────────────────────

export const ttsSchema = z.object({
  text: z
    .string()
    .min(1, "text is required")
    .max(5000, "text too long (max 5000 chars)")
    .transform(sanitizeInput),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  useSleepVoice: z.boolean().optional(),
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
    // Safari/iOS may report video/mp4, application/octet-stream, or empty type
    .refine(
      (t) => !t || t.startsWith("audio/") || t.startsWith("video/") || t === "application/octet-stream",
      "File must be an audio MIME type"
    ),
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
  // Max 64 chars covers all valid IANA timezone IDs (e.g. "America/New_York")
  timezone: z.string().min(1, 'Timezone is required').max(64, 'Timezone too long').transform(sanitizeInput),
  nudgesEnabled: z.boolean(),
  maxItemsPerBriefing: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5),
  windDownEnabled: z.boolean(),
  windDownTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM 24-hour format'),
})

export type ProactiveConfigInput = z.infer<typeof proactiveConfigSchema>

export const nudgeRequestSchema = z.object({
  lastInteractionAt: z.number(),
})

export type NudgeRequestInput = z.infer<typeof nudgeRequestSchema>

export const dismissSchema = z.object({
  // nodeId follows the same constraint as other node IDs in the codebase
  nodeId: z.string().max(50).optional(),
  // type is an internal briefing-item type; cap to prevent oversized strings
  type: z.string().min(1, 'type is required').max(50, 'type too long').transform(sanitizeInput),
})

export type DismissInput = z.infer<typeof dismissSchema>

// ─── /api/v1/actions ──────────────────────────────────────────────────────────

export const actionSchema = z.object({
  userMessage: z.string().min(1, "User message required").max(2000, "User message too long").transform(sanitizeInput),
  conversationContext: z.string().max(3000, "Context too long").transform(sanitizeInput).optional(),
})

export type ActionInput = z.infer<typeof actionSchema>

// ─── /api/v1/plugins ──────────────────────────────────────────────────────────

export const pluginSchema = z.object({
  id: z.enum(["notion", "google_calendar", "webhook"]),
  credentials: z.record(z.string().max(500).transform(sanitizeInput)),
  settings: z.record(z.string().max(500).transform(sanitizeInput)).optional(),
})

export type PluginInput = z.infer<typeof pluginSchema>

export const executePluginSchema = z.object({
  pluginId: z.enum(["notion", "google_calendar", "webhook"]),
  userMessage: z.string().min(1, "User message required").max(2000, "User message too long").transform(sanitizeInput),
})

export type ExecutePluginInput = z.infer<typeof executePluginSchema>

// ─── /api/v1/billing ──────────────────────────────────────────────────────────

export const billingCheckoutSchema = z.object({
  planId: z.enum(['plus', 'pro']),
  email: z.string().email("Invalid email format").max(255, "Email too long").transform(sanitizeInput).optional(),
})

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>

// ─── /api/v1/streak ───────────────────────────────────────────────────────────

export const checkInSchema = z.object({
  nodeId: z.string().min(1, "Node ID required").max(50, "Node ID too long").transform(sanitizeInput),
  habitTitle: z.string().min(1, "Habit title required").max(80, "Habit title too long").transform(sanitizeInput),
})
export type CheckInInput = z.infer<typeof checkInSchema>

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
