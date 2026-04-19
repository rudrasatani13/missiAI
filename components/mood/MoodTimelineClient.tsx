'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { MoodEntry, MoodLabel, WeeklyMoodInsight } from '@/types/mood'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineData {
  entries: MoodEntry[]
  weeklyInsight: WeeklyMoodInsight | null
  totalDaysTracked: number
  averageScore: number
  currentStreak: number
}

interface TooltipState {
  entry: MoodEntry | null
  date: string
  x: number
  y: number
  visible: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_LABELS: MoodLabel[] = [
  'joyful', 'excited', 'calm', 'content', 'neutral',
  'tired', 'anxious', 'stressed', 'sad', 'overwhelmed',
]

function moodColor(score: number): string {
  if (score === 0) return 'rgba(255,255,255,0.04)'
  if (score <= 2) return 'rgba(239,68,68,0.7)'
  if (score <= 4) return 'rgba(249,115,22,0.7)'
  if (score <= 6) return 'rgba(234,179,8,0.6)'
  if (score <= 8) return 'rgba(34,197,94,0.7)'
  return 'rgba(99,102,241,0.8)'
}

function moodColorSolid(score: number): string {
  if (score === 0) return 'rgba(255,255,255,0.15)'
  if (score <= 2) return '#EF4444'
  if (score <= 4) return '#F97316'
  if (score <= 6) return '#EAB308'
  if (score <= 8) return '#22C55E'
  return '#6366F1'
}

function scoreToLabel(score: number): string {
  if (score >= 9) return 'Joyful'
  if (score >= 7) return 'Good'
  if (score >= 5) return 'Okay'
  if (score >= 3) return 'Low'
  return 'Difficult'
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ─── GlassCard ────────────────────────────────────────────────────────────────

function GlassCard({
  children,
  className = '',
  delay = 0,
  glow: _glow,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  glow?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl ${className}`}
      style={{
        background: 'rgba(20,20,26,0.55)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </motion.div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        animation: 'moodPulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({
  totalDaysTracked,
  currentStreak,
  averageScore,
}: {
  totalDaysTracked: number
  currentStreak: number
  averageScore: number
}) {
  const pills = [
    { label: 'days tracked', value: totalDaysTracked.toString(), color: 'rgba(255,255,255,0.85)' },
    { label: 'day streak', value: currentStreak.toString(), color: 'rgba(255,255,255,0.85)' },
    { label: 'avg mood', value: `${averageScore.toFixed(1)} / 10`, color: moodColorSolid(averageScore) },
  ]

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {pills.map(({ label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <span className="text-sm font-semibold" style={{ color }}>{value}</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function MoodLegend() {
  return (
    <div className="flex items-center gap-3 mt-4">
      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Difficult
      </span>
      {[0, 2, 4, 7, 9].map((s) => (
        <div
          key={s}
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: moodColor(s === 0 ? 0 : s),
          }}
        />
      ))}
      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Great
      </span>
    </div>
  )
}

const CELL = 11  // px (10px square + 1px inner spacing, gap handles the rest)
const GAP = 2    // px gap between cells

function buildHeatmapDays(): string[] {
  // Returns last 91 days starting from the most recent Monday-aligned week
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days: string[] = []
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function MoodHeatmap({
  entries,
}: {
  entries: MoodEntry[]
}) {
  const entryMap = new Map(entries.map((e) => [e.date, e]))
  const days = buildHeatmapDays()

  const [tooltip, setTooltip] = useState<TooltipState>({
    entry: null, date: '', x: 0, y: 0, visible: false,
  })
  const containerRef = useRef<HTMLDivElement>(null)

  // Organise days into 7-row grid (Mon=0 … Sun=6)
  // BUGFIX (B5): Use 'T12:00:00Z' for consistent UTC parsing across all browsers.
  // Without the 'Z' suffix, some browsers parse as local time, causing
  // day-of-week misalignment in different timezones.
  const firstDate = new Date(days[0] + 'T12:00:00Z')
  const firstDow = firstDate.getUTCDay() // 0=Sun, using getUTCDay for consistency

  // Monday-indexed day of week: Mon=0, Sun=6
  const mondayDow = (firstDow + 6) % 7

  // Pad with nulls at the start so the first day falls on the correct row
  const paddedDays: (string | null)[] = [
    ...Array(mondayDow).fill(null),
    ...days,
  ]

  // Build columns (weeks)
  const numCols = Math.ceil(paddedDays.length / 7)
  const columns: (string | null)[][] = []
  for (let col = 0; col < numCols; col++) {
    const slice = paddedDays.slice(col * 7, col * 7 + 7)
    while (slice.length < 7) slice.push(null)
    columns.push(slice)
  }

  const showTooltip = (
    e: React.MouseEvent<HTMLDivElement>,
    date: string,
    entry: MoodEntry | null,
  ) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    // UX (F2): Clamp x-position to prevent tooltip from rendering off-screen
    // on narrow mobile viewports. Tooltip width is 160px.
    const rawX = rect.left - containerRect.left + CELL / 2
    const maxX = Math.max(0, containerRect.width - 160)
    setTooltip({
      entry,
      date,
      x: Math.max(0, Math.min(rawX - 80, maxX)),
      y: rect.top - containerRect.top,
      visible: true,
    })
  }

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div>
      <div className="flex items-start gap-3">
        {/* Day-of-week labels */}
        <div
          className="flex flex-col"
          style={{ gap: GAP, paddingTop: 0, flexShrink: 0 }}
        >
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              style={{
                height: CELL,
                lineHeight: `${CELL}px`,
                fontSize: 9,
                color: 'rgba(255,255,255,0.2)',
                width: 22,
                textAlign: 'right',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="relative overflow-x-auto" ref={containerRef}>
          <div className="flex" style={{ gap: GAP }}>
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap: GAP }}>
                {col.map((date, ri) =>
                  date === null ? (
                    <div
                      key={`empty-${ri}`}
                      style={{ width: CELL, height: CELL, flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      key={date}
                      onMouseEnter={(e) =>
                        showTooltip(e, date, entryMap.get(date) ?? null)
                      }
                      onMouseLeave={() =>
                        setTooltip((t) => ({ ...t, visible: false }))
                      }
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: moodColor(entryMap.get(date)?.score ?? 0),
                        cursor: entryMap.has(date) ? 'pointer' : 'default',
                        transition: 'opacity 0.1s',
                      }}
                    />
                  ),
                )}
              </div>
            ))}
          </div>

          {/* Tooltip */}
          <AnimatePresence>
            {tooltip.visible && (
              <motion.div
                key="tooltip"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'absolute',
                  // UX (F2): tooltip.x is pre-clamped in showTooltip handler
                  left: tooltip.x,
                  top: Math.max(0, tooltip.y - 76),
                  width: 160,
                  zIndex: 50,
                  pointerEvents: 'none',
                  background: 'rgba(20,20,26,0.85)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  backdropFilter: 'blur(24px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <p
                  className="text-[10px] font-medium"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {formatDate(tooltip.date)}
                </p>
                {tooltip.entry ? (
                  <>
                    <p
                      className="text-sm font-semibold mt-0.5 capitalize"
                      style={{ color: moodColorSolid(tooltip.entry.score) }}
                    >
                      {tooltip.entry.label}
                    </p>
                    <p
                      className="text-[10px] font-light mt-0.5"
                      style={{ color: 'rgba(255,255,255,0.6)' }}
                    >
                      Score: {tooltip.entry.score}/10
                    </p>
                    {tooltip.entry.trigger && (
                      <p
                        className="text-[9px] font-light mt-1 leading-relaxed"
                        style={{ color: 'rgba(255,255,255,0.35)' }}
                      >
                        {tooltip.entry.trigger}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className="text-xs font-light mt-0.5"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    No data
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Legend */}
      <MoodLegend />
    </div>
  )
}

// ─── Line Chart (raw SVG) ─────────────────────────────────────────────────────

function MoodLineChartTooltip({
  p,
  W,
  PAD_L,
  PAD_R,
  PAD_T,
}: {
  p: { x: number; y: number; entry: MoodEntry }
  W: number
  PAD_L: number
  PAD_R: number
  PAD_T: number
}) {
  return (
    <g>
      <rect
        x={Math.max(PAD_L, Math.min(p.x - 50, W - PAD_R - 100))}
        y={Math.max(PAD_T, p.y - 46)}
        width={100}
        height={40}
        rx={6}
        fill="rgba(20,20,26,0.88)"
        stroke="rgba(255,255,255,0.08)"
      />
      <text
        x={Math.max(PAD_L + 50, Math.min(p.x, W - PAD_R - 50))}
        y={Math.max(PAD_T + 14, p.y - 28)}
        textAnchor="middle"
        fontSize={9}
        fill="rgba(255,255,255,0.45)"
      >
        {formatDate(p.entry.date)}
      </text>
      <text
        x={Math.max(PAD_L + 50, Math.min(p.x, W - PAD_R - 50))}
        y={Math.max(PAD_T + 26, p.y - 16)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={moodColorSolid(p.entry.score)}
      >
        {p.entry.label} · {p.entry.score}/10
      </text>
    </g>
  )
}

function MoodLineChart({ entries }: { entries: MoodEntry[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const last30 = entries.slice(-30)

  if (last30.length < 5) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: 160, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}
      >
        Keep chatting — more data points will appear soon
      </div>
    )
  }

  const W = 560
  const H = 160
  const PAD_L = 28
  const PAD_R = 16
  const PAD_T = 12
  const PAD_B = 28

  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const n = last30.length

  // BUGFIX (A5): Guard against divide-by-zero if n === 1 (defensive — currently
  // impossible due to the < 5 guard above, but prevents future regressions)
  const xDivisor = Math.max(1, n - 1)

  // Map entries to SVG coordinates
  const pts = last30.map((e, i) => ({
    x: PAD_L + (i / xDivisor) * chartW,
    y: PAD_T + chartH - ((e.score - 1) / 9) * chartH,
    entry: e,
  }))

  // Build smooth bezier path using Catmull-Rom → Bezier conversion
  function buildPath(points: typeof pts): string {
    if (points.length < 2) return ''
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(i + 2, points.length - 1)]

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  const linePath = buildPath(pts)

  // Area fill path (close to bottom)
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1].x.toFixed(1)},${(PAD_T + chartH).toFixed(1)}` +
    ` L ${pts[0].x.toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`

  // X-axis labels: every 5th entry
  const xLabels = last30
    .map((e, i) => ({ date: e.date, i }))
    .filter(({ i }) => i % 5 === 0 || i === last30.length - 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block' }}
      >
        <defs>
          <linearGradient id="moodAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[2, 5, 8].map((score) => {
          const gy = PAD_T + chartH - ((score - 1) / 9) * chartH
          return (
            <line
              key={score}
              x1={PAD_L}
              y1={gy}
              x2={PAD_L + chartW}
              y2={gy}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          )
        })}

        {/* Y-axis labels */}
        {[1, 5, 10].map((score) => {
          const ly = PAD_T + chartH - ((score - 1) / 9) * chartH
          return (
            <text
              key={score}
              x={PAD_L - 5}
              y={ly + 4}
              textAnchor="end"
              fontSize={9}
              fill="rgba(255,255,255,0.25)"
            >
              {score}
            </text>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#moodAreaGrad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hovered === i ? 5 : 3}
              fill={hovered === i ? moodColorSolid(p.entry.score) : 'rgba(255,255,255,0.55)'}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={1}
              style={{ cursor: 'pointer', transition: 'all 0.12s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
            {hovered === i && (
              <MoodLineChartTooltip
                p={p}
                W={W}
                PAD_L={PAD_L}
                PAD_R={PAD_R}
                PAD_T={PAD_T}
              />
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ date, i }) => {
          const lx = PAD_L + (i / xDivisor) * chartW
          return (
            <text
              key={date}
              x={lx}
              y={H - 4}
              textAnchor="middle"
              fontSize={9}
              fill="rgba(255,255,255,0.25)"
            >
              {formatDate(date)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Weekly Insight Card ──────────────────────────────────────────────────────

function WeeklyInsightCard({ insight }: { insight: WeeklyMoodInsight }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl p-5"
      style={{
        background: 'rgba(20,20,26,0.55)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Eyebrow */}
      <p style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)',
        margin: '0 0 10px',
      }}>
        Weekly insight
      </p>

      <div className="flex items-start justify-between gap-3">
        {/* Insight text */}
        <p
          className="text-sm leading-relaxed flex-1"
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontStyle: 'italic',
          }}
        >
          {insight.insight}
        </p>
        <Sparkles
          className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        />
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <span
          className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {insight.weekLabel}
        </span>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: moodColorSolid(insight.averageScore) }}
          >
            {insight.averageScore.toFixed(1)}
          </span>
          <span
            className="text-[10px]"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            avg
          </span>
        </div>

        <span
          className="text-[10px] font-medium capitalize px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {insight.dominantLabel}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Manual Mood Form ─────────────────────────────────────────────────────────

function ManualMoodForm({ onSaved }: { onSaved: () => void }) {
  const [show, setShow] = useState(false)
  const [score, setScore] = useState(5)
  const [label, setLabel] = useState<MoodLabel>('neutral')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/v1/mood/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, label, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Mood logged', { description: `${label} · ${score}/10` })
        setShow(false)
        setScore(5)
        setLabel('neutral')
        setNote('')
        onSaved()
      } else {
        toast.error('Failed to save mood')
      }
    } catch {
      toast.error('Failed to save mood')
    } finally {
      setSaving(false)
    }
  }

  const sliderColor = moodColorSolid(score)

  return (
    <div>
      {!show ? (
        <button
          onClick={() => setShow(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}
        >
          <Heart className="w-3.5 h-3.5" />
          Log mood now
        </button>
      ) : (
        <motion.form
          onSubmit={handleSave}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{
            background: 'rgba(20,20,26,0.55)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Score slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={labelStyle}>How are you feeling?</label>
              <span
                className="text-sm font-semibold"
                style={{ color: sliderColor }}
              >
                {score}/10 — {scoreToLabel(score)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full"
              style={{
                accentColor: sliderColor,
                cursor: 'pointer',
                height: 4,
              }}
            />
            <div className="flex justify-between mt-1">
              <span style={dimText}>Difficult</span>
              <span style={dimText}>Great</span>
            </div>
          </div>

          {/* Mood label */}
          <div>
            <label style={labelStyle}>Emotion</label>
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value as MoodLabel)}
              style={inputStyle}
            >
              {MOOD_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label style={labelStyle}>What&apos;s on your mind? (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 60))}
              placeholder="e.g. big project deadline, relaxing evening…"
              style={inputStyle}
            />
            <p style={{ ...dimText, textAlign: 'right', marginTop: 4 }}>
              {note.length}/60
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
              style={{
                background: saving ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: saving ? 'rgba(255,255,255,0.35)' : '#0a0a0f',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="px-4 py-2 rounded-full text-xs transition-colors"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </motion.form>
      )}
    </div>
  )
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 600,
}

const dimText: React.CSSProperties = {
  fontSize: 9,
  color: 'rgba(255,255,255,0.2)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MoodTimelineClient() {
  const [data, setData] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/mood/timeline?days=90')
      const json = await res.json()
      if (json.success) {
        setData(json.data as TimelineData)
      } else {
        setError('Failed to load mood data.')
      }
    } catch {
      setError('Failed to load mood data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const isEmpty = !loading && data?.entries.length === 0

  return (
    <div
      className="min-h-screen"
      style={{
        background: '#060608',
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      {/* Ambient field — soft rose (mood palette) */}
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(520px circle at 15% 10%, rgba(251,113,133,0.06), transparent 60%), radial-gradient(400px circle at 85% 88%, rgba(244,63,94,0.04), transparent 65%)',
        filter: 'blur(100px)',
      }} />

      <div
        className="relative z-10 max-w-[880px] mx-auto px-4 md:px-6 pb-6 md:pb-8"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between mb-7"
        >
          <Link
            href="/chat"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors no-underline text-xs"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Heart
              className="w-4 h-4"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            />
            <h1
              className="text-base md:text-lg font-medium m-0"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              Mood Timeline
            </h1>
          </div>

          <div style={{ width: 60 }} />
        </motion.div>

        {/* ── Loading skeleton ────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col gap-4">
            <Skeleton style={{ height: 130 }} />
            <Skeleton style={{ height: 200 }} />
            <Skeleton style={{ height: 90 }} />
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="text-center py-16">
            <p
              className="text-sm mb-4"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {error}
            </p>
            <button
              onClick={fetchData}
              className="px-5 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {isEmpty && (
          <GlassCard className="p-10 text-center" delay={0.1}>
            <Heart
              className="w-8 h-8 mx-auto mb-4"
              style={{ color: 'rgba(255,255,255,0.2)' }}
            />
            <p
              className="text-sm font-light mb-2"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Missi is learning your emotional patterns.
            </p>
            <p
              className="text-xs font-light"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              Keep chatting and your timeline will appear here ✨
            </p>
          </GlassCard>
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        {!loading && !error && data && data.entries.length > 0 && (
          <div className="flex flex-col gap-4">

            {/* Stats row */}
            <GlassCard className="px-5 py-4" delay={0.05}>
              <StatsRow
                totalDaysTracked={data.totalDaysTracked}
                currentStreak={data.currentStreak}
                averageScore={data.averageScore}
              />
            </GlassCard>

            {/* Weekly insight */}
            {data.weeklyInsight && (
              <WeeklyInsightCard insight={data.weeklyInsight} />
            )}

            {/* Heatmap */}
            <GlassCard className="px-5 py-5" delay={0.15}>
              <p
                className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-4"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                Last 90 Days
              </p>
              <MoodHeatmap entries={data.entries} />
            </GlassCard>

            {/* Line chart */}
            <GlassCard className="px-5 py-5" delay={0.25}>
              <p
                className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-4"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                30-Day Mood Curve
              </p>
              <MoodLineChart entries={data.entries} />
            </GlassCard>

            {/* Manual log */}
            <GlassCard className="px-5 py-5" delay={0.3}>
              <ManualMoodForm onSaved={fetchData} />
            </GlassCard>

          </div>
        )}
      </div>

      <style>{`
        @keyframes moodPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
