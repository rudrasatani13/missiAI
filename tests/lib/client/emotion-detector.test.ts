import { describe, it, expect } from 'vitest'
import { detectEmotionFromAudio, getEmotionAdaptation } from '@/lib/client/emotion-detector'
import type { EmotionProfile } from '@/types/emotion'

describe('detectEmotionFromAudio', () => {
  it('all zeros timeDomain + freqData → neutral, confidence 0.2', () => {
    const timeDomain = new Float32Array(2048)
    const freqData = new Uint8Array(1024)
    const result = detectEmotionFromAudio(timeDomain, freqData)
    expect(result.state).toBe('neutral')
    expect(result.confidence).toBe(0.2)
  })

  it('high RMS values + high zero crossings + high freq → excited', () => {
    const timeDomain = new Float32Array(2048)
    // Create high energy signal with lots of zero crossings
    // Use a frequency that actually produces zero crossings between samples
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.5 * (i % 2 === 0 ? 1 : -1) // alternates +0.5/-0.5 every sample
    }
    const freqData = new Uint8Array(1024)
    // High frequency emphasis
    const bandSize = Math.floor(1024 / 3)
    for (let i = 0; i < bandSize; i++) freqData[i] = 10 // low band low
    for (let i = bandSize; i < bandSize * 2; i++) freqData[i] = 50 // mid band
    for (let i = bandSize * 2; i < bandSize * 3; i++) freqData[i] = 200 // high band high
    const result = detectEmotionFromAudio(timeDomain, freqData)
    expect(result.state).toBe('excited')
  })

  it('low RMS + low crossings + low freq → fatigued', () => {
    const timeDomain = new Float32Array(2048)
    // Low energy, very slow oscillation (few zero crossings)
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.02 * Math.sin(i * 0.01)
    }
    const freqData = new Uint8Array(1024)
    const bandSize = Math.floor(1024 / 3)
    // Low freq emphasis, negligible high
    for (let i = 0; i < bandSize; i++) freqData[i] = 100
    for (let i = bandSize; i < bandSize * 2; i++) freqData[i] = 20
    for (let i = bandSize * 2; i < bandSize * 3; i++) freqData[i] = 5
    const result = detectEmotionFromAudio(timeDomain, freqData)
    expect(result.state).toBe('fatigued')
  })

  it('crossingRate > 0.15 → speechRate fast', () => {
    const timeDomain = new Float32Array(2048)
    // Rapidly alternating sign → many zero crossings
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = (i % 2 === 0 ? 0.3 : -0.3)
    }
    const freqData = new Uint8Array(1024)
    const result = detectEmotionFromAudio(timeDomain, freqData)
    expect(result.speechRate).toBe('fast')
  })

  it('energyLevel < 0.1 → confidence 0.2', () => {
    const timeDomain = new Float32Array(2048)
    // Very quiet signal
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.005 * Math.sin(i * 0.1)
    }
    const freqData = new Uint8Array(1024)
    const result = detectEmotionFromAudio(timeDomain, freqData)
    expect(result.energyLevel).toBeLessThan(0.1)
    expect(result.confidence).toBe(0.2)
  })
})

describe('getEmotionAdaptation', () => {
  const makeProfile = (state: EmotionProfile['state']): EmotionProfile => ({
    state,
    confidence: 0.8,
    energyLevel: 0.5,
    speechRate: 'normal',
    pitchVariance: 'normal',
    detectedAt: Date.now(),
  })

  it('stressed → maxOutputTokens 300, ttsStability 0.8', () => {
    const adaptation = getEmotionAdaptation(makeProfile('stressed'))
    expect(adaptation.maxOutputTokens).toBe(300)
    expect(adaptation.ttsStability).toBe(0.8)
  })

  it('neutral → systemPromptSuffix empty string', () => {
    const adaptation = getEmotionAdaptation(makeProfile('neutral'))
    expect(adaptation.systemPromptSuffix).toBe('')
  })

  it('confident → maxOutputTokens 1000', () => {
    const adaptation = getEmotionAdaptation(makeProfile('confident'))
    expect(adaptation.maxOutputTokens).toBe(1000)
  })
})
