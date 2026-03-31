export type EmotionState =
  | 'neutral'
  | 'stressed'
  | 'excited'
  | 'fatigued'
  | 'confident'
  | 'hesitant'
  | 'happy'
  | 'frustrated'

export interface EmotionProfile {
  state: EmotionState
  confidence: number
  energyLevel: number
  speechRate: 'slow' | 'normal' | 'fast'
  pitchVariance: 'low' | 'normal' | 'high'
  detectedAt: number
}

export interface EmotionAdaptation {
  responseLength: 'short' | 'normal' | 'detailed'
  tone: 'gentle' | 'energetic' | 'calm' | 'direct' | 'encouraging'
  ttsStability: number
  ttsSimilarityBoost: number
  ttsStyle: number
  systemPromptSuffix: string
  maxOutputTokens: number
}
