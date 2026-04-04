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
  iconName: string
  desc: string
}

export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  { key: "bestfriend", label: "Best Friend", iconName: "Heart", desc: "Warm, supportive, friendly" },
  { key: "professional", label: "Professional", iconName: "Briefcase", desc: "Sharp, efficient, direct" },
  { key: "playful", label: "Playful", iconName: "Zap", desc: "Fun, witty, high energy" },
  { key: "mentor", label: "Mentor", iconName: "BrainCircuit", desc: "Wise, thoughtful, guiding" },
]
