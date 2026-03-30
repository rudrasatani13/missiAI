export type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking"

export interface ConversationEntry {
  role: "user" | "assistant"
  content: string
  timestamp?: number
}

export type PersonalityKey = "bestfriend" | "professional" | "playful" | "mentor"

export interface PersonalityOption {
  key: PersonalityKey
  label: string
  emoji: string
  desc: string
}

export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  { key: "bestfriend", label: "Best Friend", emoji: "\u{1F49B}", desc: "Warm, supportive, friendly" },
  { key: "professional", label: "Professional", emoji: "\u{1F4BC}", desc: "Sharp, efficient, direct" },
  { key: "playful", label: "Playful", emoji: "\u2728", desc: "Fun, witty, high energy" },
  { key: "mentor", label: "Mentor", emoji: "\u{1F9E0}", desc: "Wise, thoughtful, guiding" },
]
