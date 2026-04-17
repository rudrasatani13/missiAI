"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import type { SleepStory, SleepSessionHistoryEntry, BreathingTechnique } from '@/types/sleep-sessions'

export function useSleepSessions() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentStory, setCurrentStory] = useState<SleepStory | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<SleepSessionHistoryEntry[]>([])
  const [library, setLibrary] = useState<SleepStory[]>([])
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stopPlayback = useCallback(async () => {
    if (audioRef.current) {
        // Record early stop history
        if (currentStory) {
            try {
                await fetch('/api/v1/sleep-sessions/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: currentStory.id,
                        mode: currentStory.mode,
                        title: currentStory.title,
                        completed: false, // didn't finish naturally
                        durationSec: Math.floor(audioRef.current.currentTime),
                    })
                })
            } catch {}
        }

        audioRef.current.pause()
        audioRef.current = null
    }

    if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
    }
    
    setIsPlaying(false)
    setPlaybackProgress(0)
    setCurrentStory(null)
  }, [currentStory])

  useEffect(() => {
    return () => {
        // Stop on unmount
        if (audioRef.current) {
            audioRef.current.pause()
        }
        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current)
        }
    }
  }, [])

  const logCompletion = useCallback(async (story: SleepStory, duration: number) => {
    try {
        await fetch('/api/v1/sleep-sessions/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: story.id,
                mode: story.mode,
                title: story.title,
                completed: true,
                durationSec: Math.floor(duration),
            })
        })
    } catch {}
  }, [])

  const playStoryAudio = useCallback(async (story: SleepStory, source: 'library' | 'last-generated' | 'breathing', breathingScript?: string, voiceId?: string) => {
    // stop any existing
    if (audioRef.current) await stopPlayback()
    
    setIsGenerating(true)
    setError(null)

    try {
        const res = await fetch('/api/v1/sleep-sessions/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                storyId: story.id,
                source,
                text: breathingScript, // Used only if source === 'breathing'
                voiceId // the env var or user preference overrides are mostly handled on backend but can be passed
            })
        })

        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to play audio')
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        urlRef.current = url

        const audio = new Audio(url)
        audio.volume = 1.0
        // MOBILE FIX: preload + playsinline attributes
        audio.preload = 'auto'
        audio.setAttribute('playsinline', 'true')
        audio.setAttribute('webkit-playsinline', 'true')
        audioRef.current = audio

        audio.ontimeupdate = () => {
            if (audio.duration) {
                setPlaybackProgress(audio.currentTime / audio.duration)
            }
        }

        audio.onended = () => {
            logCompletion(story, audio.duration || story.estimatedDurationSec)
            setIsPlaying(false)
            setPlaybackProgress(1)
        }

        audio.onerror = () => {
            setError("Playback failed")
            setIsPlaying(false)
        }

        await audio.play()
        setCurrentStory(story)
        setIsPlaying(true)
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Playback failed')
    } finally {
        setIsGenerating(false)
    }
  }, [stopPlayback, logCompletion])

  const generatePersonalized = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    setCurrentStory(null)

    try {
        const res = await fetch('/api/v1/sleep-sessions/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'personalized' })
        })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Failed to generate')
        return data.data as SleepStory
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
        throw err
    } finally {
        setIsGenerating(false)
    }
  }, [])

  const generateCustom = useCallback(async (prompt: string) => {
    setIsGenerating(true)
    setError(null)
    setCurrentStory(null)

    try {
        const res = await fetch('/api/v1/sleep-sessions/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'custom', prompt })
        })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Failed to generate')
        return data.data as SleepStory
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
        throw err
    } finally {
        setIsGenerating(false)
    }
  }, [])

  const startBreathing = useCallback(async (technique: BreathingTechnique, cycles: number) => {
    setIsGenerating(true)
    setError(null)

    try {
        const res = await fetch('/api/v1/sleep-sessions/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'breathing', technique, cycles })
        })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Failed to load breathing script')
        
        // Mock a SleepStory representing the breathing session for standard playback
        const breathingStory: SleepStory = {
            id: `breathing-${technique}-${Date.now()}`,
            mode: 'breathing',
            title: `Guided Breathing (${technique})`,
            text: data.data.script,
            estimatedDurationSec: data.data.estimatedDurationSec,
            generatedAt: Date.now()
        }

        await playStoryAudio(breathingStory, 'breathing', data.data.script)
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
    } finally {
        setIsGenerating(false)
    }
  }, [playStoryAudio])

  const loadLibrary = useCallback(async () => {
    try {
        const res = await fetch('/api/v1/sleep-sessions/library')
        const data = await res.json()
        if (data && data.success) {
            setLibrary(data.data.stories)
            return data.data.stories as SleepStory[]
        }
    } catch {
       return []
    }
    return []
  }, [])

  const loadHistory = useCallback(async () => {
    try {
        const res = await fetch('/api/v1/sleep-sessions/history')
        const data = await res.json()
        if (data && data.success) {
            setHistory(data.data.entries)
            return data.data.entries as SleepSessionHistoryEntry[]
        }
    } catch {
       return []
    }
    return []
  }, [])

  const pausePlayback = useCallback(() => {
    if (audioRef.current) {
        audioRef.current.pause()
        setIsPlaying(false)
    }
  }, [])

  const resumePlayback = useCallback(() => {
    if (audioRef.current) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }, [])

  const skipForward = useCallback((seconds: number) => {
     if (audioRef.current) {
         audioRef.current.currentTime += seconds
     }
  }, [])

  const skipBackward = useCallback((seconds: number) => {
     if (audioRef.current) {
         audioRef.current.currentTime -= seconds
     }
  }, [])

  return {
    isGenerating,
    currentStory,
    isPlaying,
    playbackProgress,
    error,
    history,
    library,
    generatePersonalized,
    generateCustom,
    startBreathing,
    loadLibrary,
    playStoryAudio,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    skipForward,
    skipBackward,
    loadHistory
  }
}
