export type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking"

export interface ConversationEntry {
  role: "user" | "assistant"
  content: string
  timestamp?: number
  image?: string
}

// Personality multi-select was removed in 2026-05 (see audit). The union
// retains its previous shape for backward compatibility with stored chat
// sessions and validation schemas — the server collapses every value to the
// single safe assistant prompt. Custom prompts are deprecated and ignored.
export type PersonalityKey = "assistant" | "bestfriend" | "professional" | "playful" | "mentor" | "custom"

export interface PersonalityOption {
  key: PersonalityKey
  label: string
  iconName: string
  desc: string
  requiredPlan: "free" | "plus" | "pro"
}

export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  { key: "assistant", label: "Missi", iconName: "Sparkles", desc: "Helpful, direct, honest, emotionally safe", requiredPlan: "free" },
]
