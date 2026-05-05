'use client'

import React, { useState, useEffect } from 'react'
import { Moon, Play, Pause, X, SkipForward, SkipBack, Edit3, Wind, BookOpen, Stars } from 'lucide-react'
import { useSleepSessions } from '@/hooks/wind-down/useSleepSessions'
import type { SleepStory, BreathingTechnique } from '@/types/sleep-sessions'

type ProcessingState = {
  target: string
  title: string
  detail: string
}

export default function SleepSessions() {
  const {
    isGenerating,
    currentStory,
    isPlaying,
    playbackProgress,
    error,
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
  } = useSleepSessions()

  const [activeTab, setActiveTab] = useState<'tonight' | 'custom' | 'breathing' | 'library'>('tonight')
  const [customPrompt, setCustomPrompt] = useState('')
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null)
  const isBusy = isGenerating || processingState !== null

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const handlePlayPersonalized = async () => {
    setProcessingState({
      target: 'tonight',
      title: 'Missi is preparing your story...',
      detail: 'Missi is finding the softest voice for your night.',
    })
    try {
      const story = await generatePersonalized()
      if (story) {
        setProcessingState({
          target: 'tonight',
          title: 'Missi is preparing your story...',
          detail: 'Missi is finding the softest voice for your night.',
        })
        await playStoryAudio(story, 'last-generated')
      }
    } catch {} finally {
      setProcessingState(null)
    }
  }

  const handlePlayCustom = async () => {
    if (customPrompt.length < 3) return
    setProcessingState({
      target: 'custom',
      title: 'Missi is preparing your story...',
      detail: 'Missi is shaping your story into a gentle voice.',
    })
    try {
      const story = await generateCustom(customPrompt)
      if (story) {
        setProcessingState({
          target: 'custom',
          title: 'Missi is preparing your story...',
          detail: 'Missi is shaping your story into a gentle voice.',
        })
        await playStoryAudio(story, 'last-generated')
      }
    } catch {} finally {
      setProcessingState(null)
    }
  }

  const handlePlayLibrary = async (story: SleepStory) => {
    setProcessingState({
      target: `library:${story.id}`,
      title: 'Missi is preparing your story...',
      detail: 'Missi is bringing this story to life for you now.',
    })
    try {
      await playStoryAudio(story, 'library')
    } catch {} finally {
      setProcessingState(null)
    }
  }

  const handlePlayBreathing = async (technique: BreathingTechnique, cycles: number) => {
    setProcessingState({
      target: `breathing:${technique}`,
      title: 'Missi is preparing your session...',
      detail: 'Missi is settling into a calm rhythm for you.',
    })
    try {
      await startBreathing(technique, cycles)
    } catch {} finally {
      setProcessingState(null)
    }
  }

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = (Math.ceil(secs % 60))
    return `${mins}m ${rem}s`
  }

  return (
    <div className="w-full flex flex-col gap-6" style={{ fontFamily: 'var(--font-body)' }}>
        
      {/* Header */}
      <div className="flex flex-col items-start mb-3 sm:mb-4">
         <h2 className="text-xl sm:text-2xl font-light text-[var(--missi-text-primary)] tracking-wide mb-1.5 sm:mb-2">Sleep Sessions</h2>
         <p className="text-xs sm:text-sm font-light leading-relaxed text-[var(--missi-text-muted)]">
           Unwind with a personalized story or breathwork.
         </p>
      </div>

      {processingState && (
        <div className="mx-auto w-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-100 px-4 py-3 rounded-2xl">
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border border-indigo-200 border-t-transparent animate-spin shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm text-indigo-100 font-light">{processingState.title}</p>
                    <p className="text-xs text-indigo-100/60 font-light">{processingState.detail}</p>
                </div>
            </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mx-auto bg-red-950/40 border border-red-500/20 text-red-200 text-sm px-4 py-2 rounded-xl text-center">
            {error}
        </div>
      )}

      {/* Tabs — scroll edge-to-edge on tiny phones */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {([
          { id: 'tonight', label: 'Personal' },
          { id: 'custom', label: 'Custom' },
          { id: 'breathing', label: 'Breathing' },
          { id: 'library', label: 'Library' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[11px] sm:text-xs transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[var(--missi-surface)] text-[var(--missi-text-primary)] border border-[var(--missi-border)]'
                : 'text-[var(--missi-text-muted)] hover:text-[var(--missi-text-secondary)] hover:bg-[var(--missi-surface)] border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Personal */}
      {activeTab === 'tonight' && (
        <div className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-3xl p-5 sm:p-8 flex flex-col items-center justify-center text-center">
            <Stars className="w-8 h-8 text-indigo-300 opacity-80 mb-5" />
            <h3 className="text-lg text-[var(--missi-text-primary)] font-light tracking-wide mb-2">Tonight&apos;s Story</h3>
            <p className="text-sm text-center font-light mb-6 text-[var(--missi-text-secondary)]">
               A unique 10-20 minute sleep story crafted entirely for how you felt today.
            </p>
            <button 
               onClick={handlePlayPersonalized} 
               disabled={isBusy}
               className="w-full flex justify-center items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 py-4 rounded-2xl transition-colors border border-indigo-500/20 disabled:opacity-50"
            >
               {processingState?.target === 'tonight' ? (
                   <>
                     <div className="w-5 h-5 rounded-full border border-indigo-200 border-t-transparent animate-spin" />
                     Preparing...
                   </>
               ) : (
                   <><Moon className="w-4 h-4"/> Generate & Play (≈ 10-20m)</>
               )}
            </button>
        </div>
      )}

      {/* Tab: Custom */}
      {activeTab === 'custom' && (
        <div className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-3xl p-5 sm:p-8 flex flex-col items-center justify-center text-center">
            <Edit3 className="w-8 h-8 text-emerald-300 opacity-80 mb-5" />
            <h3 className="text-lg text-[var(--missi-text-primary)] font-light tracking-wide mb-2">Custom Story</h3>
            <p className="text-sm text-center font-light mb-6 text-[var(--missi-text-secondary)]">
               What would you like to hear about tonight? Missi will turn it into a 10-20 minute sleep story.
            </p>
            <textarea
               value={customPrompt}
               onChange={(e) => setCustomPrompt(e.target.value)}
               maxLength={200}
               placeholder="e.g. A walk through an ancient rain forest..."
               className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-xl p-4 text-sm text-[var(--missi-text-primary)] placeholder-[var(--missi-input-placeholder)] focus:outline-none focus:border-[var(--missi-border-strong)] resize-none mb-2"
               rows={3}
            />
            <p className="w-full text-right text-xs text-[var(--missi-text-muted)] mb-6">{customPrompt.length}/200</p>
            <button 
               onClick={handlePlayCustom} 
               disabled={isBusy || customPrompt.length < 3}
               className="w-full flex justify-center items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 py-4 rounded-2xl transition-colors border border-emerald-500/20 disabled:opacity-50"
            >
               {processingState?.target === 'custom' ? (
                   <>
                     <div className="w-5 h-5 rounded-full border border-emerald-200 border-t-transparent animate-spin" />
                     Preparing...
                   </>
               ) : (
                   <><Play className="w-4 h-4"/> Create & Play (≈ 10-20m)</>
               )}
            </button>
        </div>
      )}

      {/* Tab: Breathing */}
      {activeTab === 'breathing' && (
         <div className="w-full flex flex-col gap-3">
             <button 
                 onClick={() => handlePlayBreathing('4-7-8', 6)}
                 disabled={isBusy}
                 className="w-full flex items-center justify-between p-4 sm:p-6 bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-[24px] hover:bg-[var(--missi-surface-secondary)] transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> 4-7-8 Sleep Breath
                     </h4>
                     <p className="text-xs text-[var(--missi-text-muted)]">Inhale 4s, hold 7s, exhale 8s. Instantly calming.</p>
                 </div>
                 {processingState?.target === 'breathing:4-7-8' ? (
                     <div className="flex items-center gap-2 text-sky-200/80">
                         <div className="w-4 h-4 rounded-full border border-sky-200 border-t-transparent animate-spin" />
                         <span className="text-xs">Preparing...</span>
                     </div>
                 ) : (
                     <Play className="w-5 h-5 text-[var(--missi-text-muted)]" />
                 )}
             </button>

             <button 
                 onClick={() => handlePlayBreathing('box', 5)}
                 disabled={isBusy}
                 className="w-full flex items-center justify-between p-4 sm:p-6 bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-[24px] hover:bg-[var(--missi-surface-secondary)] transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> Box Breathing
                     </h4>
                     <p className="text-xs text-[var(--missi-text-muted)]">Hold and exhale equally. Reset your mind.</p>
                 </div>
                 {processingState?.target === 'breathing:box' ? (
                     <div className="flex items-center gap-2 text-sky-200/80">
                         <div className="w-4 h-4 rounded-full border border-sky-200 border-t-transparent animate-spin" />
                         <span className="text-xs">Preparing...</span>
                     </div>
                 ) : (
                     <Play className="w-5 h-5 text-[var(--missi-text-muted)]" />
                 )}
             </button>

             <button 
                 onClick={() => handlePlayBreathing('belly', 8)}
                 disabled={isBusy}
                 className="w-full flex items-center justify-between p-4 sm:p-6 bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-[24px] hover:bg-[var(--missi-surface-secondary)] transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> Deep Belly Breath
                     </h4>
                     <p className="text-xs text-[var(--missi-text-muted)]">Deep inhale, slow exhale. For profound rest.</p>
                 </div>
                 {processingState?.target === 'breathing:belly' ? (
                     <div className="flex items-center gap-2 text-sky-200/80">
                         <div className="w-4 h-4 rounded-full border border-sky-200 border-t-transparent animate-spin" />
                         <span className="text-xs">Preparing...</span>
                     </div>
                 ) : (
                     <Play className="w-5 h-5 text-[var(--missi-text-muted)]" />
                 )}
             </button>
         </div>
      )}

      {/* Tab: Library */}
      {activeTab === 'library' && (
         <div className="w-full overflow-x-auto pb-4 hide-scrollbar snap-x flex gap-4">
             {library.map((story) => (
                 <button 
                     key={story.id} 
                     onClick={() => handlePlayLibrary(story)}
                     disabled={isBusy}
                     className="snap-start shrink-0 w-56 sm:w-64 p-4 sm:p-6 bg-[var(--missi-surface)] border border-[var(--missi-border)] inset-shadow-sm rounded-[24px] hover:bg-[var(--missi-surface-secondary)] transition-colors text-left flex flex-col justify-between disabled:opacity-60"
                     style={{ minHeight: '180px' }}
                 >
                     <div>
                        <div className="flex items-center gap-2 mb-3">
                           <BookOpen className="w-4 h-4 text-amber-300/80" />
                           <span className="text-xs uppercase tracking-wider text-[var(--missi-text-muted)] font-mono">{story.category}</span>
                        </div>
                        <h4 className="text-sm font-light text-[var(--missi-text-primary)] leading-relaxed mb-2">{story.title}</h4>
                        <p className="text-xs text-[var(--missi-text-muted)] line-clamp-3 leading-loose">{story.text}</p>
                     </div>
                     {processingState?.target === `library:${story.id}` ? (
                         <div className="flex items-center gap-2 mt-4 text-xs text-amber-200/80">
                             <div className="w-3.5 h-3.5 rounded-full border border-amber-200 border-t-transparent animate-spin" />
                             Preparing...
                         </div>
                     ) : (
                         <div className="flex items-center gap-2 mt-4 text-xs text-amber-300/50">
                             <Play className="w-3 h-3" /> {formatTime(story.estimatedDurationSec)}
                         </div>
                     )}
                 </button>
             ))}
         </div>
      )}

      <p className="text-center text-[10px] uppercase font-mono tracking-widest text-[var(--missi-text-muted)] mt-6">
         For educational purposes only.<br/>Not a substitute for medical advice.
      </p>

      {/* Global Audio Player Dock */}
      {currentStory && (
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 z-50">
             <div className="w-full bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-full py-3 px-6 flex items-center justify-between shadow-2xl">
                 
                 {/* Left controls */}
                 <div className="flex items-center gap-3 w-1/3">
                    <button onClick={() => skipBackward(30)} aria-label="Skip backward 30 seconds" className="text-[var(--missi-text-muted)] hover:text-[var(--missi-text-primary)] transition-colors">
                        <SkipBack className="w-4 h-4" />
                    </button>
                    <button onClick={isPlaying ? pausePlayback : resumePlayback} aria-label={isPlaying ? "Pause playback" : "Resume playback"} className="w-10 h-10 rounded-full bg-[var(--missi-surface)] flex items-center justify-center text-[var(--missi-text-primary)] hover:bg-[var(--missi-surface)] transition-all">
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-0.5" />}
                    </button>
                    <button onClick={() => skipForward(30)} aria-label="Skip forward 30 seconds" className="text-[var(--missi-text-muted)] hover:text-[var(--missi-text-primary)] transition-colors">
                        <SkipForward className="w-4 h-4" />
                    </button>
                 </div>

                 {/* Center text & progress */}
                 <div className="w-1/3 flex flex-col items-center">
                    <p className="text-xs text-[var(--missi-text-secondary)] font-light truncate w-full text-center mb-1">
                        {currentStory.title}
                    </p>
                    <div className="w-full h-1 bg-[var(--missi-surface)] rounded-full overflow-hidden">
                        <div 
                           className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                           style={{ width: `${playbackProgress * 100}%` }}
                        />
                    </div>
                 </div>

                 {/* Right controls */}
                 <div className="w-1/3 flex justify-end">
                    <button onClick={stopPlayback} aria-label="Stop playback" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--missi-text-muted)] hover:text-[var(--missi-text-primary)] hover:bg-[var(--missi-surface)] transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                 </div>
                 
             </div>
          </div>
      )}

    </div>
  )
}
