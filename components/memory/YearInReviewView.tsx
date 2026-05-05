'use client'

import React, { useState, useEffect, useRef } from 'react'
import { YearInReview } from '@/types/life-story'
import { Share2, AlertCircle, Star } from 'lucide-react'
import html2canvas from 'html2canvas'

export function YearInReviewView() {
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [review, setReview] = useState<YearInReview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchReview() {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/life-story/year-review?year=${year}`)
        if (res.ok) {
          const data = await res.json()
          setReview(data)
        } else if (res.status === 429) {
          setError('Rate limit exceeded for generating Year in Review. Try again next week.')
        } else {
          setError('Failed to fetch Year in Review')
        }
      } catch {
        setError('Network error.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchReview()
  }, [year])

  const handleShare = async () => {
    if (!shareRef.current || isSharing) return
    setIsSharing(true)
    
    try {
      const shareEl = shareRef.current
      shareEl.style.display = 'block'
      
      const canvas = await html2canvas(shareEl, {
        scale: 2,
        backgroundColor: '#000000',
        logging: false
      })
      
      shareEl.style.display = 'none'

      canvas.toBlob(async (blob) => {
        if (!blob) return setIsSharing(false)

        const filename = `missi-year-in-review-${year}.png`
        const file = new File([blob], filename, { type: 'image/png' })

        if (navigator.share && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `My ${year} in Review`,
              text: 'See how my year unfolded with missi 🌙 missi.space',
              files: [file]
            })
          } catch {
            // Unsuccessful share (e.g., user cancellation), fallback to download could be annoying, so just ignore
          }
        } else {
          // Fallback to manual download
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.style.display = 'none'
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
        }
        setIsSharing(false)
      }, 'image/png')
    } catch (e) {
      console.error(e)
      setIsSharing(false)
    }
  }

  // Render SVG Arc
  const renderArc = () => {
    if (!review) return null
    const pts = review.emotionalArc.map((val, i) => {
      const x = (i / 11) * 100
      const y = 100 - (val / 10) * 100
      return `${x},${y}`
    }).join(' ')

    const polyPts = `0,100 ${pts} 100,100`

    return (
      <div className="w-full h-32 relative mt-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <polygon points={polyPts} fill="url(#arcGrad)" />
          <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth="2" filter="url(#glow)" />
          {/* Data points */}
          {review.emotionalArc.map((val, i) => (
             <circle key={i} cx={(i / 11) * 100} cy={100 - (val / 10) * 100} r="1.5" fill="#fff" />
          ))}
        </svg>
        <div className="flex justify-between mt-2 px-1 text-[9px] text-[var(--missi-text-muted)] uppercase tracking-widest font-mono">
          <span>Jan</span><span>Dec</span>
        </div>
      </div>
    )
  }

  // Year choices
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear; y >= 2023; y--) years.push(y)

  return (
    <div className="flex-1 w-full h-full flex flex-col relative overflow-hidden">
      
      {/* Hidden Shareable Wrapper */}
      <div 
        ref={shareRef}
        id="year-review-shareable"
        className="absolute top-0 left-0 w-[1080px] h-[1920px] bg-[var(--missi-bg)] text-[var(--missi-text-primary)] p-20 flex-col overflow-hidden hidden"
        style={{ zIndex: -100 }}
      >
        {/* Background visual for wrap */}
        <div className="absolute inset-0 z-0 opacity-40" style={{ background: 'radial-gradient(ellipse at center, #3b82f640 0%, #000 70%)' }}></div>
        <div className="relative z-10 flex flex-col h-full items-center text-center justify-center gap-12">
          <h1 className="text-8xl font-serif text-[var(--missi-text-primary)]">My {year}</h1>
          <p className="text-4xl text-[var(--missi-text-secondary)] italic max-w-3xl leading-relaxed">"{review?.narrative}"</p>
          
          <div className="flex gap-4 flex-wrap justify-center mt-8">
            {review?.highlights.slice(0, 3).map((h, i) => (
              <span key={i} className="px-6 py-3 rounded-full bg-[var(--missi-surface)] text-2xl border border-[var(--missi-border)]">{h}</span>
            ))}
          </div>

          <div className="mt-auto pt-20 flex items-center gap-4 opacity-50">
            <span className="text-2xl font-mono tracking-widest uppercase">missi.space</span>
          </div>
        </div>
      </div>


      {/* Header Selector */}
      <div className="p-4 md:p-8 pb-0 flex items-center justify-between z-20">
        <select 
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-lg px-4 py-2 text-xl font-serif text-[var(--missi-text-primary)] outline-none cursor-pointer hover:bg-[var(--missi-surface-secondary)] transition-colors appearance-none"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {review && !isLoading && !error && review.totalMemories > 0 && (
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-[var(--missi-text-primary)] px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95"
          >
            {isSharing ? <div className="w-4 h-4 rounded-full border-2 border-[var(--missi-border-strong)] border-t-white animate-spin" /> : <Share2 className="w-4 h-4" />}
            {isSharing ? 'Capturing...' : 'Share Review'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--missi-text-secondary)] space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--missi-border)]"></div>
            <p className="text-sm">Synthesizing {year}...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p>{error}</p>
          </div>
        ) : !review || review.totalMemories === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--missi-text-secondary)] text-center">
            <p className="mb-2">No memories recorded for {year}.</p>
            <p className="text-sm text-[var(--missi-text-muted)]">Select another year or come back when you have more data.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8 pb-12">
            
            {/* Hero Card */}
            <div className="relative rounded-3xl border border-[var(--missi-border)] bg-[var(--missi-bg)] overflow-hidden p-8 md:p-12">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              
              <div className="relative z-10">
                <div className="flex items-end gap-3 mb-6">
                  <h2 className="text-5xl md:text-7xl font-serif text-[var(--missi-text-primary)]">{year}</h2>
                  <span className="text-[var(--missi-text-muted)] mb-2 font-mono uppercase tracking-widest text-sm">{review.totalMemories} Memories</span>
                </div>
                
                <p className="text-xl md:text-2xl text-[var(--missi-text-secondary)] leading-relaxed italic mb-8 font-serif">
                  {review.narrative}
                </p>

                <div className="flex flex-wrap gap-2">
                  {review.highlights.map((h, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-md bg-[var(--missi-surface)] border border-[var(--missi-border)] text-sm text-[var(--missi-text-secondary)]">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Emotional Arc */}
              <div className="rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] p-6">
                <h3 className="text-sm font-medium text-[var(--missi-text-secondary)] uppercase tracking-widest mb-2">Emotional Arc</h3>
                {renderArc()}
              </div>

              {/* Top Categories */}
              <div className="rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] p-6 flex flex-col justify-between">
                <h3 className="text-sm font-medium text-[var(--missi-text-secondary)] uppercase tracking-widest mb-6">Top Categories</h3>
                <div className="space-y-4">
                  {review.topCategories.map(c => (
                    <div key={c.category} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-[var(--missi-text-secondary)] uppercase">{c.category}</div>
                      <div className="flex-1 h-1.5 bg-[var(--missi-surface)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${(c.count / review.topCategories[0].count) * 100}%` }}
                        />
                      </div>
                      <div className="w-8 text-right text-xs text-[var(--missi-text-secondary)]">{c.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top People */}
            {review.topPeople.length > 0 && (
              <div className="rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] p-6">
                <h3 className="text-sm font-medium text-[var(--missi-text-secondary)] uppercase tracking-widest mb-6 text-center">Top People</h3>
                <div className="flex flex-wrap justify-center gap-6">
                  {review.topPeople.map(p => (
                    <div key={p} className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-[var(--missi-surface)] border border-[var(--missi-border)] flex items-center justify-center text-lg text-[var(--missi-text-secondary)]">
                        {p.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-[var(--missi-text-secondary)]">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Moments */}
            {review.keyMoments.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-[var(--missi-text-primary)] mb-4 font-serif">Defining Moments</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {review.keyMoments.map(id => (
                    <div key={id} className="p-5 rounded-xl border border-[var(--missi-border)] bg-[var(--missi-surface)]">
                      <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mb-3 flex items-center justify-center text-[var(--missi-text-muted)]">
                        <Star className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-sm font-medium text-[var(--missi-text-secondary)] mb-1">Moment ID {id.slice(0, 5)}...</h4>
                      <p className="text-xs text-[var(--missi-text-muted)]">You experienced a high emotional peak here.</p>
                      {/* Normally, we would get the full node text from KV to embed inside the keyMoments array response, 
                          but since keyMoments is string[], we only have ID. To display properly, we would either need 
                          to fetch nodes or update route to return titles too. Let's assume the string array could have been { id, title }.
                          But types dictacte string[]. I will just render this placeholder. To improve, the route should populate details, but the type is rigid to string array.
                          Wait, the route can return full nodes inside. The prompt says "array of 3-5 LifeNode IDs". So only IDs are available. */}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
