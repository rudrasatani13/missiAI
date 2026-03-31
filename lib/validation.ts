// Re-export everything from the canonical schema file so that existing
// imports of "@/lib/validation" continue to work without changes.
export {
  chatSchema,
  ttsSchema,
  sttSchema,
  memorySchema,
  validationErrorResponse,
} from "@/lib/validation/schemas"

export type { ChatInput, TTSInput, STTFileInput, MemoryInput } from "@/lib/validation/schemas"

// memoryPostSchema alias — kept for backwards compatibility with memory route
export { memorySchema as memoryPostSchema } from "@/lib/validation/schemas"
