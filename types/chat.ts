export type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking"

export interface ConversationEntry {
  role: "user" | "assistant"
  content: string
  timestamp?: number
  image?: string
}

export type PersonalityKey = "assistant" | "bestfriend" | "professional" | "playful" | "mentor" | "custom"

export interface PersonalityOption {
  key: PersonalityKey
  label: string
  iconName: string
  desc: string
  requiredPlan: "free" | "plus" | "pro"
}

export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  { key: "assistant", label: "Helpful Assistant", iconName: "Sparkles", desc: "Helpful, precise, and objective AI", requiredPlan: "free" },
  { key: "bestfriend", label: "Best Friend", iconName: "Heart", desc: "Warm, supportive, friendly", requiredPlan: "free" },
  { key: "professional", label: "Professional", iconName: "Briefcase", desc: "Sharp, efficient, direct", requiredPlan: "plus" },
  { key: "playful", label: "Playful", iconName: "Zap", desc: "Fun, witty, high energy", requiredPlan: "plus" },
  { key: "mentor", label: "Mentor", iconName: "BrainCircuit", desc: "Wise, thoughtful, guiding", requiredPlan: "plus" },
  { key: "custom", label: "Custom Personality", iconName: "Wand2", desc: "Create your own rules", requiredPlan: "plus" },
]
