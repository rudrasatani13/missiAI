'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Calendar, FileText, Mail, TrendingUp, Target,
  Brain, Search, DollarSign, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Loader2, AlertCircle, Clock,
  Sparkles,
} from 'lucide-react'
import type { AgentPlan, AgentPlanStep } from '@/lib/ai/agent-planner'
import type { AgentHistoryEntry } from '@/lib/ai/agent-history'

// ─── Typewriter Animation ─────────────────────────────────────────────────────

function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const [displayedChars, setDisplayedChars] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDisplayedChars(0)
    if (!text) return

    let current = 0
    const interval = setInterval(() => {
      current += Math.max(1, Math.floor(text.length / 200)) // Adaptive speed
      if (current >= text.length) {
        setDisplayedChars(text.length)
        clearInterval(interval)
      } else {
        setDisplayedChars(current)
      }
      // Auto-scroll to bottom
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight
      }
    }, speed)

    return () => clearInterval(interval)
  }, [text, speed])

  const visible = text.slice(0, displayedChars)
  const isTyping = displayedChars < text.length

  return (
    <div
      ref={containerRef}
      className="max-h-[150px] overflow-y-scroll overflow-x-hidden pr-2 custom-scrollbar"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <p className="text-xs text-white/50 whitespace-pre-wrap font-sans leading-relaxed break-words" style={{ wordBreak: 'break-word', minHeight: 'min-content' }}>
        {visible}
        {isTyping && <span className="inline-block w-1.5 h-3.5 bg-purple-400/80 ml-0.5 animate-pulse rounded-sm" />}
      </p>
    </div>
  )
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-purple-400"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExecutionStep {
  stepNumber: number
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary?: string
  output?: string
  error?: string
}

interface PlanResponse {
  plan: AgentPlan
  confirmToken: string | null
  requiresConfirmation: boolean
  remaining: number
}

interface ExpenseSnapshot {
  monthlyTotal: number
  currency: string
  byCategory: Record<string, number>
}

// ─── Tool icons map ───────────────────────────────────────────────────────────

function ToolIcon({ toolName }: { toolName: string }) {
  const iconProps = { size: 14, className: 'text-white/50' }
  switch (toolName) {
    case 'readCalendar':
    case 'createCalendarEvent':
      return <Calendar {...iconProps} />
    case 'createNote':
    case 'takeNote':
      return <FileText {...iconProps} />
    case 'draftEmail':
      return <Mail {...iconProps} />
    case 'searchMemory':
      return <Brain {...iconProps} />
    case 'searchWeb':
      return <Search {...iconProps} />
    case 'logExpense':
      return <DollarSign {...iconProps} />
    case 'getWeekSummary':
      return <TrendingUp {...iconProps} />
    case 'updateGoalProgress':
      return <Target {...iconProps} />
    default:
      return <Zap {...iconProps} />
  }
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const BASE_CHIPS = [
  { label: 'Log an expense', value: 'Log an expense of 500 rupees on food today' },
  { label: 'Save a note', value: 'Save a note: ' },
  { label: 'Draft an email', value: 'Draft a friendly email to ' },
  { label: 'Summarize my week', value: 'Give me a summary of my week' },
]

const CALENDAR_CHIPS = [
  { label: 'Check my schedule', value: "What's on my calendar for the next 48 hours?" },
  { label: 'Create an event', value: 'Schedule a meeting tomorrow at 3pm about ' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentDashboard() {
  const [input, setInput] = useState('')
  const [isPlanning, setIsPlanning] = useState(false)
  const [planData, setPlanData] = useState<PlanResponse | null>(null)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [history, setHistory] = useState<AgentHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expenses, setExpenses] = useState<ExpenseSnapshot | null>(null)
  const [hasCalendar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [xpAnimation, setXpAnimation] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load history and expenses on mount
  useEffect(() => {
    void loadHistory()
    void loadExpenses()
  }, [])

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/v1/agents/history')
      if (res.ok) {
        const data = await res.json() as { entries: AgentHistoryEntry[] }
        setHistory(data.entries ?? [])
      }
    } catch {}
  }

  const loadExpenses = async () => {
    try {
      const res = await fetch('/api/v1/agents/expenses')
      if (res.ok) {
        const data = await res.json() as ExpenseSnapshot & { monthlyTotal: number }
        setExpenses(data)
        // If we got expense data with calendar check embedded, check calendar
        // We infer calendar availability from expenses endpoint response
      }
    } catch {}
  }

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  const handleChipClick = (value: string) => {
    setInput(value)
    textareaRef.current?.focus()
  }

  // ── Plan ────────────────────────────────────────────────────────────────────

  const handlePlan = useCallback(async () => {
    if (!input.trim() || isPlanning) return
    setError(null)
    setPlanData(null)
    setExecutionSteps([])
    setIsComplete(false)
    setIsPlanning(true)

    try {
      const res = await fetch('/api/v1/agents/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      })

      if (res.status === 429) {
        setError("You've reached your daily agent limit. Try again tomorrow!")
        return
      }
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        setError(err.error ?? 'Planning failed. Please try again.')
        return
      }

      const data = await res.json() as PlanResponse

      // If plan has no steps or no token, show error — don't flash the empty plan UI
      if (data.plan.steps.length === 0) {
        setError(data.plan.summary === "I can't do that yet"
          ? "I can't handle that request yet. Try something like: save a note, log an expense, or draft an email."
          : 'Could not create a plan. Please try a more specific request.')
        return
      }
      if (!data.confirmToken) {
        setError('Failed to generate confirmation token. Please try again.')
        return
      }

      setPlanData(data)
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setIsPlanning(false)
    }
  }, [input, isPlanning])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handlePlan()
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async (approved: boolean) => {
    if (!planData) return

    if (!approved) {
      setPlanData(null)
      return
    }

    // Initialize execution steps
    setExecutionSteps(
      planData.plan.steps.map(s => ({
        stepNumber: s.stepNumber,
        description: s.description,
        status: 'pending',
      }))
    )
    setIsExecuting(true)
    setPlanData(prev => prev ? { ...prev } : null)

    try {
      const res = await fetch('/api/v1/agents/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmToken: planData.confirmToken,
          approved: true,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as Record<string, unknown>
        console.error('[AgentDashboard] confirm error:', res.status, errBody)
        // Show full error details for debugging
        const detail = errBody.details ? ` | Details: ${JSON.stringify(errBody.details)}` : ''
        const token = planData.confirmToken ? `(token: ${planData.confirmToken.slice(0, 8)}...)` : '(token: NULL)'
        setError(`${res.status}: ${errBody.error ?? 'Execution failed.'} ${token}${detail}`)
        setIsExecuting(false)
        return
      }

      // Stream SSE events
      const reader = res.body?.getReader()
      if (!reader) {
        setError('Stream unavailable.')
        setIsExecuting(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw) as {
              type: string
              stepNumber?: number
              description?: string
              summary?: string
              output?: string
              error?: string
              stepsCompleted?: number
            }

            if (event.type === 'step_start') {
              setExecutionSteps(prev =>
                prev.map(s =>
                  s.stepNumber === event.stepNumber ? { ...s, status: 'running' } : s
                )
              )
            } else if (event.type === 'step_done') {
              setExecutionSteps(prev =>
                prev.map(s =>
                  s.stepNumber === event.stepNumber
                    ? { ...s, status: 'done', summary: event.summary, output: event.output }
                    : s
                )
              )
            } else if (event.type === 'step_error') {
              setExecutionSteps(prev =>
                prev.map(s =>
                  s.stepNumber === event.stepNumber
                    ? { ...s, status: 'error', error: event.error }
                    : s
                )
              )
            } else if (event.type === 'complete') {
              setCompletedCount(event.stepsCompleted ?? 0)
              setIsComplete(true)
              setIsExecuting(false)
              if ((event.stepsCompleted ?? 0) > 0) {
                setXpAnimation(true)
                setTimeout(() => setXpAnimation(false), 3000)
              }
              void loadHistory()
              void loadExpenses()
            }
          } catch {}
        }
      }
    } catch {
      setError('Execution interrupted. Please try again.')
      setIsExecuting(false)
    }
  }, [planData])

  // Auto-execute if plan doesn't require confirmation
  useEffect(() => {
    if (planData && !planData.requiresConfirmation && !isExecuting && !isComplete) {
      void handleConfirm(true)
    }
  }, [planData, isExecuting, isComplete, handleConfirm])

  const handleReset = () => {
    setPlanData(null)
    setExecutionSteps([])
    setIsComplete(false)
    setCompletedCount(0)
    setError(null)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const chips = [...BASE_CHIPS, ...(hasCalendar ? CALENDAR_CHIPS : [])]
  const showInput = !planData && !isExecuting && !isComplete
  const showPlan = planData && !isExecuting && !isComplete
  const showExecution = isExecuting || (isComplete && executionSteps.length > 0)

  return (
    <div className="min-h-full text-white">
      {/* Header (sidebar provides navigation — no Back link needed) */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-purple-400" />
          <h1 className="text-white/90 font-medium">Missi Agent</h1>
        </div>
        <span className="text-white/30 text-sm">Tell Missi what to do</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Main Content Area (Mutually Exclusive States) */}
        <AnimatePresence mode="wait">
          {/* Section 1 — Input */}
          {showInput && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-4 relative overflow-hidden"
            >
              {/* Planning overlay animation */}
              <AnimatePresence>
                {isPlanning && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-10 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center rounded-2xl"
                  >
                    <div className="relative w-14 h-14 mb-4">
                      <motion.div
                        className="absolute inset-0 rounded-full border-t-2 border-purple-500 opacity-80"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      />
                      <motion.div
                        className="absolute inset-1.5 rounded-full border-r-2 border-fuchsia-400 opacity-60"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      />
                      <motion.div
                        className="absolute inset-3 rounded-full border-b-2 border-violet-400 opacity-80"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />
                      <Sparkles size={16} className="absolute inset-0 m-auto text-purple-300 animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-white/90 flex items-center">
                      Missi is building a plan <StreamingDots />
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Tell Missi what to do... e.g. 'Schedule a meeting with Rahul tomorrow at 3pm about the pitch deck'"
                className="w-full bg-transparent text-white/90 placeholder-white/30 text-sm resize-none outline-none min-h-[80px] leading-relaxed"
                rows={3}
              />

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2">
                {chips.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => handleChipClick(chip.value)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-all"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-white/30">⌘+Enter to plan</span>
                <button
                  onClick={() => void handlePlan()}
                  disabled={!input.trim() || isPlanning}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
                >
                  {isPlanning ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Planning...
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      Plan it
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Error message */}
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300 mb-4"
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400"><XCircle size={16} /></button>
            </motion.div>
          )}

          {/* Section 2 — Plan Preview */}
          {showPlan && planData && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="px-5 pt-5 pb-4">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Missi&apos;s Plan</p>
                <p className="text-white/90 text-base font-medium">{planData.plan.summary}</p>
              </div>

              {planData.plan.steps.length > 0 && (
                <div className="border-t border-white/8 px-5 py-3 space-y-2">
                  {planData.plan.steps.map((step: AgentPlanStep) => (
                    <div key={step.stepNumber} className="flex items-start gap-3 py-1.5">
                      <span className="text-xs text-white/30 w-4 shrink-0 mt-0.5">{step.stepNumber}</span>
                      <ToolIcon toolName={step.toolName} />
                      <span className="text-sm text-white/70 flex-1">{step.description}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-white/25">{step.estimatedDuration}</span>
                        {step.isDestructive && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/80 border border-amber-500/20">
                            action
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-white/8 px-5 py-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => setPlanData(null)}
                  className="text-sm text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
                {planData.plan.steps.length === 0 || !planData.confirmToken ? (
                  <span className="text-sm text-white/30 italic">
                    {planData.plan.steps.length === 0
                      ? "No actionable steps — try a more specific request"
                      : "Token missing — please try again"}
                  </span>
                ) : (
                  <button
                    onClick={() => void handleConfirm(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white text-sm font-medium transition-all shadow-lg shadow-purple-900/30"
                  >
                    <Sparkles size={14} />
                    Go ahead Missi ✨
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {showExecution && (
            <motion.div
              key="execution"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="px-5 pt-5 pb-3">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
                  {isComplete ? 'Completed' : 'Running'}
                </p>
                {isComplete && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-white/90 text-base font-medium"
                  >
                    Done! Completed {completedCount} of {executionSteps.length} steps.
                  </motion.p>
                )}
              </div>

              <div className="border-t border-white/8 px-5 py-3 space-y-3">
                {executionSteps.map(step => (
                  <motion.div
                    key={step.stepNumber}
                    className="space-y-1"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: step.stepNumber * 0.1, duration: 0.3 }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/30 w-4 shrink-0">{step.stepNumber}</span>
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {step.status === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
                        {step.status === 'running' && (
                          <motion.div
                            className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                          />
                        )}
                        {step.status === 'done' && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                            <CheckCircle size={14} className="text-green-400" />
                          </motion.div>
                        )}
                        {step.status === 'error' && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <XCircle size={14} className="text-red-400/70" />
                          </motion.div>
                        )}
                      </div>
                      <span className={`text-sm flex-1 ${
                        step.status === 'running' ? 'text-white/90'
                        : step.status === 'done' ? 'text-white/60'
                        : step.status === 'error' ? 'text-white/40 line-through'
                        : 'text-white/30'
                      }`}>
                        {step.description}
                        {step.status === 'running' && <StreamingDots />}
                      </span>
                    </div>
                    {step.status === 'running' && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-purple-400/60 ml-11 leading-relaxed italic"
                      >
                        Working on it…
                      </motion.p>
                    )}
                    {step.status === 'done' && step.summary && (
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-white/35 ml-11 leading-relaxed"
                      >
                        {step.summary}
                      </motion.p>
                    )}
                    {step.status === 'done' && step.output && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                        className="ml-11 mt-1.5 p-3 rounded-lg bg-white/[0.03] border border-white/8"
                      >
                        <TypewriterText text={step.output} speed={8} />
                      </motion.div>
                    )}
                    {step.status === 'error' && step.error && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-red-400/50 ml-11"
                      >
                        {step.error}
                      </motion.p>
                    )}
                  </motion.div>
                ))}
              </div>

              {isComplete && (
                <div className="border-t border-white/8 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {xpAnimation && (
                      <motion.span
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-yellow-400/80"
                      >
                        +{completedCount * 2} XP earned ✨
                      </motion.span>
                    )}
                  </div>
                  <button
                    onClick={handleReset}
                    className="text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    New task
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section 4 — History */}
        {history.length > 0 && (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => setHistoryOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-white/40" />
                <span className="text-sm text-white/60">Recent tasks</span>
                <span className="text-xs text-white/30">({history.length})</span>
              </div>
              {historyOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
            </button>

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/8 divide-y divide-white/5">
                    {history.map(entry => (
                      <div key={entry.id} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/70 truncate">{entry.userMessage}</p>
                          <p className="text-xs text-white/30 mt-0.5">
                            {new Date(entry.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-white/30">{entry.stepsCompleted}/{entry.stepsTotal}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            entry.status === 'completed'
                              ? 'bg-green-500/10 text-green-400/70 border-green-500/20'
                              : entry.status === 'partial'
                                ? 'bg-amber-500/10 text-amber-400/70 border-amber-500/20'
                                : 'bg-white/5 text-white/30 border-white/10'
                          }`}>
                            {entry.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Section 5 — Expense Snapshot */}
        {expenses && expenses.monthlyTotal > 0 && (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} className="text-white/40" />
              <span className="text-sm text-white/50">This month</span>
              <span className="ml-auto text-white/80 font-medium">
                ₹{expenses.monthlyTotal.toLocaleString('en-IN')}
              </span>
            </div>
            {Object.keys(expenses.byCategory).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(expenses.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([cat, amount]) => {
                    const pct = expenses.monthlyTotal > 0 ? (amount / expenses.monthlyTotal) * 100 : 0
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-xs text-white/40">
                          <span className="capitalize">{cat}</span>
                          <span>₹{amount.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500/50 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
