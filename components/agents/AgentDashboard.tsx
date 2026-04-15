"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, Play, CheckCircle2, AlertCircle, XCircle, Clock, Calendar, Mail, FileText, Search, CreditCard, Loader2 } from "lucide-react"

interface PlanStep {
  stepNumber: number
  toolName: string
  description: string
  isDestructive: boolean
  estimatedDuration: string
}

interface Plan {
  steps: PlanStep[]
  summary: string
  requiresConfirmation: boolean
  planId: string
}

interface HistoryEntry {
  id: string
  date: string
  userMessage: string
  planSummary: string
  status: "completed" | "partial" | "cancelled"
  stepsCompleted: number
  stepsTotal: number
}

interface ExpenseData {
  monthlyTotal: number
  currency: string
  byCategory: Record<string, number>
}

type StepStatus = "pending" | "running" | "done" | "error"

export function AgentDashboard() {
  const [prompt, setPrompt] = useState("")
  const [isPlanning, setIsPlanning] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [confirmToken, setConfirmToken] = useState<string | null>(null)

  const [isExecuting, setIsExecuting] = useState(false)
  const [stepStatuses, setStepStatuses] = useState<Record<number, { status: StepStatus, message?: string }>>({})
  const [executionDone, setExecutionDone] = useState(false)

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [expenseData, setExpenseData] = useState<ExpenseData | null>(null)

  useEffect(() => {
    fetchHistory()
    fetchExpenses()
  }, [])

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/v1/agents/history')
      if (res.ok) {
        setHistory(await res.json())
      }
    } catch {}
  }

  const fetchExpenses = async () => {
    try {
      const res = await fetch('/api/v1/agents/expenses')
      if (res.ok) {
        setExpenseData(await res.json())
      }
    } catch {}
  }

  const handlePlan = async () => {
    if (!prompt.trim()) return
    setIsPlanning(true)
    setPlan(null)
    setConfirmToken(null)
    setExecutionDone(false)
    setStepStatuses({})

    try {
      const res = await fetch('/api/v1/agents/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt })
      })
      if (!res.ok) throw new Error("Failed to plan")
      const data = await res.json()
      setPlan(data.plan)
      setConfirmToken(data.confirmToken)
    } catch (error) {
      console.error(error)
      // fallback handling could go here
    } finally {
      setIsPlanning(false)
    }
  }

  const handleConfirm = async (approved: boolean) => {
    if (!confirmToken) {
      if (plan && plan.steps.length === 0) {
        setPlan(null)
        setPrompt("")
      }
      return
    }

    if (!approved) {
      await fetch('/api/v1/agents/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmToken, approved: false, originalMessage: prompt })
      })
      setPlan(null)
      setConfirmToken(null)
      fetchHistory()
      return
    }

    setIsExecuting(true)

    try {
      const response = await fetch('/api/v1/agents/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmToken, approved: true, originalMessage: prompt })
      })

      if (!response.body) throw new Error("No response body")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let currentStatuses: Record<number, { status: StepStatus, message?: string }> = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'step_start') {
                currentStatuses[data.stepNumber] = { status: 'running' }
                setStepStatuses({ ...currentStatuses })
              } else if (data.type === 'step_done') {
                currentStatuses[data.stepNumber] = { status: 'done', message: data.output || data.summary }
                setStepStatuses({ ...currentStatuses })
              } else if (data.type === 'step_error') {
                currentStatuses[data.stepNumber] = { status: 'error', message: data.error }
                setStepStatuses({ ...currentStatuses })
              } else if (data.type === 'complete') {
                setExecutionDone(true)
                setIsExecuting(false)
                fetchHistory()
                fetchExpenses()
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      setIsExecuting(false)
    }
  }

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'createCalendarEvent':
      case 'readCalendar': return <Calendar className="w-5 h-5 text-blue-400" />
      case 'draftEmail': return <Mail className="w-5 h-5 text-purple-400" />
      case 'createNote':
      case 'takeNote': return <FileText className="w-5 h-5 text-emerald-400" />
      case 'searchWeb': return <Search className="w-5 h-5 text-amber-400" />
      case 'logExpense': return <CreditCard className="w-5 h-5 text-rose-400" />
      default: return <Sparkles className="w-5 h-5 text-neutral-400" />
    }
  }

  const commonTasks = [
    "Log an expense of 500 INR for food",
    "Save a note about my new app idea",
    "Draft an email to John about the project",
    "Summarize my week",
    "Check my calendar for tomorrow"
  ]

  return (
    <div className="space-y-8">
      {/* Input Area */}
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell Missi what to do... e.g. 'Schedule a meeting with Rahul tomorrow at 3pm'"
          className="w-full bg-transparent border-none text-neutral-100 placeholder:text-neutral-500 focus:ring-0 resize-none min-h-[100px] text-lg"
          disabled={isPlanning || isExecuting}
        />

        <div className="flex flex-wrap gap-2 mt-4 pb-4 border-b border-neutral-800">
          {commonTasks.map(task => (
            <button
              key={task}
              onClick={() => setPrompt(task)}
              disabled={isPlanning || isExecuting}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-full transition-colors truncate max-w-xs"
            >
              {task}
            </button>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={handlePlan}
            disabled={!prompt.trim() || isPlanning || isExecuting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
          >
            {isPlanning ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Planning...</>
            ) : (
              <><Sparkles className="w-5 h-5" /> Plan it</>
            )}
          </button>
        </div>
      </div>

      {/* Plan Preview & Execution */}
      <AnimatePresence mode="wait">
        {plan && !isExecuting && !executionDone && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-neutral-900/80 border border-indigo-900/50 rounded-2xl p-6 shadow-2xl"
          >
            <h3 className="text-xl font-medium text-neutral-200 mb-6 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-indigo-400" />
              {plan.summary}
            </h3>

            <div className="space-y-4">
              {plan.steps.map(step => (
                <div key={step.stepNumber} className="flex items-start gap-4 p-4 rounded-xl bg-neutral-800/50 border border-neutral-700/50">
                  <div className="mt-1">{getToolIcon(step.toolName)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-200">Step {step.stepNumber}</span>
                      {step.isDestructive && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20">
                          Destructive
                        </span>
                      )}
                    </div>
                    <p className="text-neutral-400 mt-1">{step.description}</p>
                  </div>
                  <div className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" /> {step.estimatedDuration}
                  </div>
                </div>
              ))}

              {plan.steps.length === 0 && (
                <div className="p-4 rounded-xl bg-neutral-800/50 text-neutral-400">
                  I don't have the right tools to do this yet.
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8">
              {plan.steps.length > 0 ? (
                <>
                  <button
                    onClick={() => handleConfirm(true)}
                    className="flex-1 bg-white text-black hover:bg-neutral-200 px-6 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    Go ahead Missi ✨ <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleConfirm(false)}
                    className="px-6 py-3 rounded-xl font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setPlan(null)}
                  className="flex-1 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 px-6 py-3 rounded-xl font-medium transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </motion.div>
        )}

        {(isExecuting || executionDone) && plan && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl"
          >
            <h3 className="text-xl font-medium text-neutral-200 mb-6 flex items-center gap-3">
              {executionDone ? (
                <><CheckCircle2 className="w-6 h-6 text-emerald-400" /> Done!</>
              ) : (
                <><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /> Executing Plan...</>
              )}
            </h3>

            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-neutral-800 before:to-transparent">
              {plan.steps.map(step => {
                const s = stepStatuses[step.stepNumber]
                const status = s?.status || 'pending'

                return (
                  <div key={step.stepNumber} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-neutral-900 bg-neutral-800 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow z-10">
                      {status === 'pending' && <Clock className="w-4 h-4 text-neutral-500" />}
                      {status === 'running' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                      {status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {status === 'error' && <XCircle className="w-4 h-4 text-rose-400" />}
                    </div>

                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-neutral-800 bg-neutral-900/50 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-neutral-200 flex items-center gap-2">
                          {getToolIcon(step.toolName)} Step {step.stepNumber}
                        </div>
                      </div>
                      <p className="text-sm text-neutral-400 mb-2">{step.description}</p>

                      {status === 'done' && s.message && (
                        <div className="mt-3 text-sm text-emerald-400/90 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                          {s.message}
                        </div>
                      )}
                      {status === 'error' && s.message && (
                        <div className="mt-3 text-sm text-rose-400/90 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                          {s.message}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {executionDone && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => {
                    setPlan(null)
                    setPrompt("")
                    setExecutionDone(false)
                  }}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-6 py-2.5 rounded-xl transition-colors"
                >
                  Start New Task
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {/* Expense Snapshot */}
        {expenseData && (
          <div className="col-span-1 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4 text-neutral-300 font-medium">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              Expense Snapshot
            </div>
            <div className="text-3xl font-light mb-1">
              {expenseData.monthlyTotal.toLocaleString()} <span className="text-lg text-neutral-500">{expenseData.currency}</span>
            </div>
            <div className="text-sm text-neutral-500 mb-6">This month</div>

            <div className="space-y-3">
              {Object.entries(expenseData.byCategory)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 4)
                .map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400 capitalize">{category}</span>
                  <span className="text-neutral-200 font-medium">{amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div className={`bg-neutral-900/40 border border-neutral-800/60 rounded-2xl p-5 ${expenseData ? 'col-span-1 md:col-span-2' : 'col-span-1 md:col-span-3'}`}>
          <div className="flex items-center gap-2 mb-6 text-neutral-300 font-medium">
            <Clock className="w-5 h-5 text-indigo-400" />
            Recent Activity
          </div>

          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="text-neutral-500 text-sm italic">No recent agent actions.</div>
            ) : (
              history.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-800/50 transition-colors border border-transparent hover:border-neutral-700/50">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-neutral-200 truncate font-medium text-sm">{item.userMessage || item.planSummary}</p>
                    <p className="text-neutral-500 text-xs mt-1">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    {item.status === 'completed' && <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">Completed</span>}
                    {item.status === 'cancelled' && <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 bg-neutral-400/10 px-2 py-0.5 rounded">Cancelled</span>}
                    {item.status === 'partial' && <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">Partial</span>}
                    <span className="text-xs text-neutral-500">
                      {item.stepsCompleted}/{item.stepsTotal} steps
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
