'use client'

import { useState, useRef, useCallback } from 'react'
import { detectEmotionFromAudio, getEmotionAdaptation } from '@/lib/client/emotion-detector'
import type { EmotionProfile, EmotionAdaptation } from '@/types/emotion'

export function useEmotionDetector() {
  const emotionHistoryRef = useRef<EmotionProfile[]>([])
  const currentEmotionRef = useRef<EmotionProfile | null>(null)
  const [currentEmotion, setCurrentEmotion] = useState<EmotionProfile | null>(null)

  const analyzeRecording = useCallback(
    (timeDomainData: Float32Array, freqData: Uint8Array): EmotionProfile => {
      const detected = detectEmotionFromAudio(timeDomainData, freqData)

      // Add to history, keep last 5
      emotionHistoryRef.current.push(detected)
      if (emotionHistoryRef.current.length > 5) {
        emotionHistoryRef.current.shift()
      }

      // Smoothing: if last 2+ readings share same state → confirm
      const history = emotionHistoryRef.current
      if (history.length >= 2) {
        const lastTwo = history.slice(-2)
        if (lastTwo[0].state === lastTwo[1].state) {
          currentEmotionRef.current = detected
          setCurrentEmotion(detected)
        }
        // else keep currentEmotion unchanged (prevents flickering)
      } else {
        // First reading — set it
        currentEmotionRef.current = detected
        setCurrentEmotion(detected)
      }

      return detected
    },
    [],
  )

  const getSmoothedAdaptation = useCallback((): EmotionAdaptation => {
    const emotion = currentEmotionRef.current
    if (emotion && emotion.confidence > 0.4) {
      return getEmotionAdaptation(emotion)
    }
    // Return neutral adaptation
    return getEmotionAdaptation({
      state: 'neutral',
      confidence: 0.5,
      energyLevel: 0.5,
      speechRate: 'normal',
      pitchVariance: 'normal',
      detectedAt: Date.now(),
    })
  }, [])

  const resetEmotion = useCallback(() => {
    emotionHistoryRef.current = []
    setCurrentEmotion(null)
    currentEmotionRef.current = null
  }, [])

  return {
    currentEmotion,
    analyzeRecording,
    getSmoothedAdaptation,
    resetEmotion,
  }
}
