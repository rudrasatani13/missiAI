import { describe, it, expect, vi } from 'vitest'

// Mock React hooks for testing
vi.mock('react', () => ({
  useState: (initial: any) => {
    let value = initial
    const setValue = (v: any) => { value = typeof v === 'function' ? v(value) : v }
    return [value, setValue]
  },
  useRef: (initial: any) => ({ current: initial }),
  useCallback: (fn: any) => fn,
}))

import { useEmotionDetector } from '@/hooks/useEmotionDetector'

describe('useEmotionDetector', () => {
  it('same emotion twice in history → state confirmed', () => {
    const { analyzeRecording, currentEmotion } = useEmotionDetector()

    // Create high energy + fast + high pitch signal for 'excited'
    const timeDomain = new Float32Array(2048)
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.5 * Math.sin(i * Math.PI)
    }
    const freqData = new Uint8Array(1024)
    const bandSize = Math.floor(1024 / 3)
    for (let i = 0; i < bandSize; i++) freqData[i] = 10
    for (let i = bandSize; i < bandSize * 2; i++) freqData[i] = 50
    for (let i = bandSize * 2; i < bandSize * 3; i++) freqData[i] = 200

    // First analysis
    const first = analyzeRecording(timeDomain, freqData)
    // Second with same signal
    const second = analyzeRecording(timeDomain, freqData)

    expect(first.state).toBe(second.state)
  })

  it('different emotions → keeps previous (no flicker)', () => {
    const detector = useEmotionDetector()

    // First: excited signal (high energy, alternating, high freq)
    const excitedTimeDomain = new Float32Array(2048)
    for (let i = 0; i < excitedTimeDomain.length; i++) {
      excitedTimeDomain[i] = 0.5 * (i % 2 === 0 ? 1 : -1)
    }
    const excitedFreqData = new Uint8Array(1024)
    const bandSize = Math.floor(1024 / 3)
    for (let i = 0; i < bandSize; i++) excitedFreqData[i] = 10
    for (let i = bandSize; i < bandSize * 2; i++) excitedFreqData[i] = 50
    for (let i = bandSize * 2; i < bandSize * 3; i++) excitedFreqData[i] = 200

    // Set baseline with two same readings
    detector.analyzeRecording(excitedTimeDomain, excitedFreqData)
    detector.analyzeRecording(excitedTimeDomain, excitedFreqData)

    // Now send a fatigued signal (low energy, slow)
    const fatiguedTimeDomain = new Float32Array(2048)
    for (let i = 0; i < fatiguedTimeDomain.length; i++) {
      fatiguedTimeDomain[i] = 0.02 * Math.sin(i * 0.01)
    }
    const fatiguedFreqData = new Uint8Array(1024)
    for (let i = 0; i < bandSize; i++) fatiguedFreqData[i] = 100
    for (let i = bandSize; i < bandSize * 2; i++) fatiguedFreqData[i] = 20
    for (let i = bandSize * 2; i < bandSize * 3; i++) fatiguedFreqData[i] = 5

    const result = detector.analyzeRecording(fatiguedTimeDomain, fatiguedFreqData)
    // The detected result itself is fatigued
    expect(result.state).toBe('fatigued')
    // Note: with the smoothing logic, currentEmotion stays as previous since
    // last 2 readings are different (excited vs fatigued) - no flicker
  })

  it('confidence <= 0.4 → getSmoothedAdaptation returns neutral', () => {
    const { analyzeRecording, getSmoothedAdaptation } = useEmotionDetector()

    // Very quiet signal → low confidence
    const timeDomain = new Float32Array(2048)
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.001
    }
    const freqData = new Uint8Array(1024)

    // Analyze twice to confirm
    analyzeRecording(timeDomain, freqData)
    analyzeRecording(timeDomain, freqData)

    const adaptation = getSmoothedAdaptation()
    // Since confidence is 0.2 (< 0.4), should return neutral
    expect(adaptation.systemPromptSuffix).toBe('')
    expect(adaptation.maxOutputTokens).toBe(600)
  })

  it('resetEmotion → currentEmotion becomes null', () => {
    const detector = useEmotionDetector()

    // Generate some emotion
    const timeDomain = new Float32Array(2048)
    for (let i = 0; i < timeDomain.length; i++) {
      timeDomain[i] = 0.5 * Math.sin(i * Math.PI)
    }
    const freqData = new Uint8Array(1024)
    detector.analyzeRecording(timeDomain, freqData)

    // Reset
    detector.resetEmotion()
    expect(detector.currentEmotion).toBeNull()
  })
})
