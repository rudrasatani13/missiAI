// Re-export everything from the canonical schema file so that existing
// imports of "@/lib/validation" continue to work without changes.
export {
  chatSchema,
  ttsSchema,
  sttSchema,
  memorySchema,
  validationErrorResponse,
} from "@/lib/schemas"

export type { ChatInput, TTSInput, STTFileInput, MemoryInput } from "@/lib/schemas"

// memoryPostSchema alias — kept for backwards compatibility with memory route
export { memorySchema as memoryPostSchema } from "@/lib/schemas"
