'use client'

import React, { useState, useEffect } from 'react'
import { Moon, Play, Pause, X, SkipForward, SkipBack, Edit3, Wind, BookOpen, Stars } from 'lucide-react'
import { useSleepSessions } from '@/hooks/useSleepSessions'
import type { SleepStory, BreathingTechnique } from '@/types/sleep-sessions'

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

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const handlePlayPersonalized = async () => {
    try {
       const story = await generatePersonalized()
       if (story) {
           await playStoryAudio(story, 'last-generated')
       }
    } catch {}
  }

  const handlePlayCustom = async () => {
    if (customPrompt.length < 3) return
    try {
       const story = await generateCustom(customPrompt)
       if (story) {
           await playStoryAudio(story, 'last-generated')
       }
    } catch {}
  }

  const handlePlayLibrary = async (story: SleepStory) => {
    await playStoryAudio(story, 'library')
  }

  const handlePlayBreathing = async (technique: BreathingTechnique, cycles: number) => {
    await startBreathing(technique, cycles)
  }

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = (Math.ceil(secs % 60))
    return `${mins}m ${rem}s`
  }

  return (
    <div className="w-full flex flex-col gap-6" style={{ fontFamily: 'var(--font-body)' }}>
        
      {/* Header */}
      <div className="flex flex-col items-start mb-4">
         <h2 className="text-2xl font-light text-white tracking-wide mb-2">Sleep Sessions</h2>
         <p className="text-sm font-light leading-relaxed text-white/40">
           Unwind with a personalized story or breathwork.
         </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-auto bg-red-950/40 border border-red-500/20 text-red-200 text-sm px-4 py-2 rounded-xl text-center">
            {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex justify-start gap-2 mb-4 flex-wrap">
        <button onClick={() => setActiveTab('tonight')} className={`px-4 py-2 rounded-full text-xs transition-colors ${activeTab === 'tonight' ? 'bg-white/10 text-white border border-white/20' : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>Personal</button>
        <button onClick={() => setActiveTab('custom')} className={`px-4 py-2 rounded-full text-xs transition-colors ${activeTab === 'custom' ? 'bg-white/10 text-white border border-white/20' : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>Custom</button>
        <button onClick={() => setActiveTab('breathing')} className={`px-4 py-2 rounded-full text-xs transition-colors ${activeTab === 'breathing' ? 'bg-white/10 text-white border border-white/20' : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>Breathing</button>
        <button onClick={() => setActiveTab('library')} className={`px-4 py-2 rounded-full text-xs transition-colors ${activeTab === 'library' ? 'bg-white/10 text-white border border-white/20' : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>Library</button>
      </div>

      {/* Tab: Personal */}
      {activeTab === 'tonight' && (
        <div className="w-full bg-black/20 border border-white/10 inset-shadow-sm rounded-3xl p-8 flex flex-col items-center justify-center text-center">
            <Stars className="w-8 h-8 text-indigo-300 opacity-80 mb-5" />
            <h3 className="text-lg text-white font-light tracking-wide mb-2">Tonight&apos;s Story</h3>
            <p className="text-sm text-center font-light mb-6 text-white/50">
               A unique sleep story crafted entirely for how you felt today.
            </p>
            <button 
               onClick={handlePlayPersonalized} 
               disabled={isGenerating}
               className="w-full flex justify-center items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 py-4 rounded-2xl transition-colors border border-indigo-500/20 disabled:opacity-50"
            >
               {isGenerating && activeTab === 'tonight' ? (
                   <div className="w-5 h-5 rounded-full border border-indigo-200 border-t-transparent animate-spin" />
               ) : (
                   <><Moon className="w-4 h-4"/> Generate & Play (≈ 5m)</>
               )}
            </button>
        </div>
      )}

      {/* Tab: Custom */}
      {activeTab === 'custom' && (
        <div className="w-full bg-black/20 border border-white/10 inset-shadow-sm rounded-3xl p-8 flex flex-col items-center justify-center text-center">
            <Edit3 className="w-8 h-8 text-emerald-300 opacity-80 mb-5" />
            <h3 className="text-lg text-white font-light tracking-wide mb-2">Custom Story</h3>
            <p className="text-sm text-center font-light mb-6 text-white/50">
               What would you like to hear about tonight?
            </p>
            <textarea
               value={customPrompt}
               onChange={(e) => setCustomPrompt(e.target.value)}
               maxLength={200}
               placeholder="e.g. A walk through an ancient rain forest..."
               className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none mb-2"
               rows={3}
            />
            <p className="w-full text-right text-xs text-white/30 mb-6">{customPrompt.length}/200</p>
            <button 
               onClick={handlePlayCustom} 
               disabled={isGenerating || customPrompt.length < 3}
               className="w-full flex justify-center items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 py-4 rounded-2xl transition-colors border border-emerald-500/20 disabled:opacity-50"
            >
               {isGenerating && activeTab === 'custom' ? (
                   <div className="w-5 h-5 rounded-full border border-emerald-200 border-t-transparent animate-spin" />
               ) : (
                   <><Play className="w-4 h-4"/> Create & Play</>
               )}
            </button>
        </div>
      )}

      {/* Tab: Breathing */}
      {activeTab === 'breathing' && (
         <div className="w-full flex flex-col gap-3">
             <button 
                 onClick={() => handlePlayBreathing('4-7-8', 6)}
                 disabled={isGenerating}
                 className="w-full flex items-center justify-between p-6 bg-black/20 border border-white/10 inset-shadow-sm rounded-[24px] hover:bg-black/40 transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-white text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> 4-7-8 Sleep Breath
                     </h4>
                     <p className="text-xs text-white/40">Inhale 4s, hold 7s, exhale 8s. Instantly calming.</p>
                 </div>
                 <Play className="w-5 h-5 text-white/20" />
             </button>

             <button 
                 onClick={() => handlePlayBreathing('box', 5)}
                 disabled={isGenerating}
                 className="w-full flex items-center justify-between p-6 bg-black/20 border border-white/10 inset-shadow-sm rounded-[24px] hover:bg-black/40 transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-white text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> Box Breathing
                     </h4>
                     <p className="text-xs text-white/40">Hold and exhale equally. Reset your mind.</p>
                 </div>
                 <Play className="w-5 h-5 text-white/20" />
             </button>

             <button 
                 onClick={() => handlePlayBreathing('belly', 8)}
                 disabled={isGenerating}
                 className="w-full flex items-center justify-between p-6 bg-black/20 border border-white/10 inset-shadow-sm rounded-[24px] hover:bg-black/40 transition-colors disabled:opacity-50 text-left"
             >
                 <div>
                     <h4 className="text-white text-sm tracking-wide mb-1 flex items-center gap-2">
                         <Wind className="w-4 h-4 text-sky-300"/> Deep Belly Breath
                     </h4>
                     <p className="text-xs text-white/40">Deep inhale, slow exhale. For profound rest.</p>
                 </div>
                 <Play className="w-5 h-5 text-white/20" />
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
                     disabled={isGenerating}
                     className="snap-start shrink-0 w-64 p-6 bg-black/20 border border-white/10 inset-shadow-sm rounded-[24px] hover:bg-black/40 transition-colors text-left flex flex-col justify-between"
                     style={{ minHeight: '180px' }}
                 >
                     <div>
                        <div className="flex items-center gap-2 mb-3">
                           <BookOpen className="w-4 h-4 text-amber-300/80" />
                           <span className="text-xs uppercase tracking-wider text-white/40 font-mono">{story.category}</span>
                        </div>
                        <h4 className="text-sm font-light text-white leading-relaxed mb-2">{story.title}</h4>
                        <p className="text-xs text-white/30 line-clamp-3 leading-loose">{story.text}</p>
                     </div>
                     <div className="flex items-center gap-2 mt-4 text-xs text-amber-300/50">
                         <Play className="w-3 h-3" /> {formatTime(story.estimatedDurationSec)}
                     </div>
                 </button>
             ))}
         </div>
      )}

      <p className="text-center text-[10px] uppercase font-mono tracking-widest text-white/20 mt-6">
         For educational purposes only.<br/>Not a substitute for medical advice.
      </p>

      {/* Global Audio Player Dock */}
      {currentStory && (
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 z-50">
             <div className="w-full bg-[#0a0a0a] border border-white/10 rounded-full py-3 px-6 flex items-center justify-between shadow-2xl backdrop-blur-xl">
                 
                 {/* Left controls */}
                 <div className="flex items-center gap-3 w-1/3">
                    <button onClick={() => skipBackward(30)} aria-label="Skip backward 30 seconds" className="text-white/40 hover:text-white transition-colors">
                        <SkipBack className="w-4 h-4" />
                    </button>
                    <button onClick={isPlaying ? pausePlayback : resumePlayback} aria-label={isPlaying ? "Pause playback" : "Resume playback"} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all">
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-0.5" />}
                    </button>
                    <button onClick={() => skipForward(30)} aria-label="Skip forward 30 seconds" className="text-white/40 hover:text-white transition-colors">
                        <SkipForward className="w-4 h-4" />
                    </button>
                 </div>

                 {/* Center text & progress */}
                 <div className="w-1/3 flex flex-col items-center">
                    <p className="text-xs text-white/80 font-light truncate w-full text-center mb-1">
                        {currentStory.title}
                    </p>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div 
                           className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                           style={{ width: `${playbackProgress * 100}%` }}
                        />
                    </div>
                 </div>

                 {/* Right controls */}
                 <div className="w-1/3 flex justify-end">
                    <button onClick={stopPlayback} aria-label="Stop playback" className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                 </div>
                 
             </div>
          </div>
      )}

      {/* Inject custom scrollbar hiding utility locally just in case it doesn't exist */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  )
}
