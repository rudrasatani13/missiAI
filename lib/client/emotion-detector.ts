'use client'

import type { EmotionProfile, EmotionState, EmotionAdaptation } from '@/types/emotion'

export function detectEmotionFromAudio(
  timeDomainData: Float32Array,
  freqData: Uint8Array
): EmotionProfile {
  // Step 1 — Energy (RMS)
  let sum = 0
  for (let i = 0; i < timeDomainData.length; i++) {
    sum += timeDomainData[i] * timeDomainData[i]
  }
  const rms = Math.sqrt(sum / timeDomainData.length)
  const energyLevel = Math.min(1, rms * 6)

  // Step 2 — Frequency bands
  const bandSize = Math.floor(freqData.length / 3)
  let lowSum = 0
  for (let i = 0; i < bandSize; i++) lowSum += freqData[i]
  const lowEnergy = (lowSum / bandSize) / 255

  let midSum = 0
  for (let i = bandSize; i < bandSize * 2; i++) midSum += freqData[i]
  const midEnergy = (midSum / bandSize) / 255

  let highSum = 0
  for (let i = bandSize * 2; i < bandSize * 3; i++) highSum += freqData[i]
  const highEnergy = (highSum / bandSize) / 255

  const pitchRatio = highEnergy / (lowEnergy + 0.001)

  let pitchVariance: 'low' | 'normal' | 'high'
  if (pitchRatio > 0.6) {
    pitchVariance = 'high'
  } else if (pitchRatio < 0.2) {
    pitchVariance = 'low'
  } else {
    pitchVariance = 'normal'
  }

  // Step 3 — Speech rate via zero crossings
  let zeroCrossings = 0
  for (let i = 1; i < timeDomainData.length; i++) {
    if (timeDomainData[i] * timeDomainData[i - 1] < 0) {
      zeroCrossings++
    }
  }
  const crossingRate = zeroCrossings / timeDomainData.length

  let speechRate: 'slow' | 'normal' | 'fast'
  if (crossingRate > 0.15) {
    speechRate = 'fast'
  } else if (crossingRate < 0.05) {
    speechRate = 'slow'
  } else {
    speechRate = 'normal'
  }

  // Step 4 — Map to EmotionState
  // Silence guard: if energy is negligible, it's just silence → neutral
  let state: EmotionState
  if (energyLevel < 0.05) {
    state = 'neutral'
  } else if (energyLevel > 0.6 && speechRate === 'fast' && pitchVariance === 'high') {
    state = 'excited'
  } else if (energyLevel > 0.6 && speechRate === 'fast' && pitchVariance === 'low') {
    state = 'frustrated'
  } else if (energyLevel < 0.2 && speechRate === 'slow' && pitchVariance === 'low') {
    state = 'fatigued'
  } else if (energyLevel < 0.2 && speechRate === 'slow' && pitchVariance === 'normal') {
    state = 'hesitant'
  } else if (speechRate === 'fast') {
    state = 'stressed'
  } else if (energyLevel > 0.6 && speechRate === 'normal' && pitchVariance === 'normal') {
    state = 'confident'
  } else if (pitchVariance === 'high') {
    state = 'happy'
  } else {
    state = 'neutral'
  }

  // Step 5 — Confidence
  let confidence: number
  if (energyLevel < 0.1) {
    confidence = 0.2
  } else {
    confidence = Math.min(0.95, energyLevel * 2)
  }

  return {
    state,
    confidence,
    energyLevel,
    speechRate,
    pitchVariance,
    detectedAt: Date.now(),
  }
}

export function getEmotionAdaptation(emotion: EmotionProfile): EmotionAdaptation {
  const adaptations: Record<EmotionState, EmotionAdaptation> = {
    stressed: {
      responseLength: 'short',
      tone: 'calm',
      ttsStability: 0.8,
      ttsSimilarityBoost: 0.6,
      ttsStyle: 0.1,
      maxOutputTokens: 300,
      systemPromptSuffix:
        'The user sounds stressed. Keep response very short (1-2 sentences max). Be calm and simple. No long explanations. Always address what the user actually asked about.',
    },
    excited: {
      responseLength: 'normal',
      tone: 'energetic',
      ttsStability: 0.4,
      ttsSimilarityBoost: 0.8,
      ttsStyle: 0.6,
      maxOutputTokens: 600,
      systemPromptSuffix:
        'The user sounds excited. Match their energy. Be upbeat and enthusiastic in your response.',
    },
    fatigued: {
      responseLength: 'short',
      tone: 'gentle',
      ttsStability: 0.9,
      ttsSimilarityBoost: 0.5,
      ttsStyle: 0.05,
      maxOutputTokens: 300,
      systemPromptSuffix:
        'The user sounds tired. Be very gentle and brief. Maximum 2 sentences. Keep it warm and easy. Always address what the user actually asked about.',
    },
    frustrated: {
      responseLength: 'short',
      tone: 'direct',
      ttsStability: 0.7,
      ttsSimilarityBoost: 0.7,
      ttsStyle: 0.2,
      maxOutputTokens: 300,
      systemPromptSuffix:
        'The user sounds frustrated. Acknowledge briefly then give a direct helpful answer to what they actually asked. No filler. Do not use web search unless they explicitly ask for factual information.',
    },
    hesitant: {
      responseLength: 'normal',
      tone: 'encouraging',
      ttsStability: 0.6,
      ttsSimilarityBoost: 0.7,
      ttsStyle: 0.3,
      maxOutputTokens: 600,
      systemPromptSuffix:
        'The user sounds uncertain. Be encouraging. Validate their thoughts before responding.',
    },
    confident: {
      responseLength: 'detailed',
      tone: 'direct',
      ttsStability: 0.5,
      ttsSimilarityBoost: 0.8,
      ttsStyle: 0.4,
      maxOutputTokens: 1000,
      systemPromptSuffix:
        'The user sounds confident. Match their energy. Give a thorough, substantive response.',
    },
    happy: {
      responseLength: 'normal',
      tone: 'energetic',
      ttsStability: 0.4,
      ttsSimilarityBoost: 0.8,
      ttsStyle: 0.5,
      maxOutputTokens: 600,
      systemPromptSuffix: 'The user sounds happy. Be warm and cheerful.',
    },
    neutral: {
      responseLength: 'normal',
      tone: 'calm',
      ttsStability: 0.5,
      ttsSimilarityBoost: 0.75,
      ttsStyle: 0.3,
      maxOutputTokens: 600,
      systemPromptSuffix: '',
    },
  }

  return adaptations[emotion.state]
}
