'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Zap, RotateCcw, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import 'katex/dist/katex.min.css'
import { MathText } from './MathText'
import type { QuizSession } from '@/types/exam-buddy'

interface QuizViewProps {
  session: QuizSession
  onRetry: () => void
  localSessionToken?: string
}

interface SubmitResult {
  session: QuizSession
  xpEarned: number
  encouragement: string
  score: { correct: number; incorrect: number; total: number; pct: number; totalMarks: number }
}

export function QuizView({ session: initialSession, onRetry, localSessionToken }: QuizViewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const questions = initialSession.questions
  const allAnswered = questions.every((q) => answers[q.id])
  const currentQ = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const isFirst = currentIndex === 0
  const currentAnswered = !!answers[currentQ?.id]

  const handleSelect = (questionId: string, option: string) => {
    if (result) return
    setAnswers((prev) => ({ ...prev, [questionId]: option }))
  }

  const handleNext = () => {
    if (!isLast) setCurrentIndex((i) => i + 1)
  }

  const handlePrev = () => {
    if (!isFirst) setCurrentIndex((i) => i - 1)
  }

  const handleSubmit = async () => {
    if (!allAnswered || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/v1/exam-buddy/quiz/${initialSession.id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localSessionToken ? { answers, sessionToken: localSessionToken } : { answers }),
        },
      )
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Submission failed')
        return
      }
      setResult(data as SubmitResult)
    } catch {
      setError('Network error — please try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (result) {
    return <ResultsView result={result} onRetry={onRetry} userAnswers={answers} />
  }

  if (!currentQ) return null

  // Progress dots
  const answeredCount = Object.keys(answers).length
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-[28px] p-5 md:p-6"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.92), rgba(18,18,24,0.88))',
          border: '1px solid var(--missi-border)',
          boxShadow: '0 28px 80px -40px rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
              style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
              <span className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'var(--missi-text-secondary)' }}>
                Focus Quiz
              </span>
            </div>
            <p className="text-xs font-medium capitalize mb-2" style={{ color: '#8B5CF6' }}>
              {initialSession.subject.replace('_', ' ')}
            </p>
            <h2 className="text-2xl md:text-[2.2rem] font-light leading-tight" style={{ color: 'var(--missi-text-primary)' }}>
              {initialSession.topic}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[220px]">
            <div className="rounded-2xl px-4 py-4"
              style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
              <p className="text-xl font-light" style={{ color: 'var(--missi-text-primary)' }}>{currentIndex + 1}/{questions.length}</p>
              <p className="text-[11px] font-light mt-1" style={{ color: 'var(--missi-text-muted)' }}>Current question</p>
            </div>
            <div className="rounded-2xl px-4 py-4"
              style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
              <p className="text-xl font-light" style={{ color: 'var(--missi-text-primary)' }}>{progressPercent}%</p>
              <p className="text-[11px] font-light mt-1" style={{ color: 'var(--missi-text-muted)' }}>Progress</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 mb-3">
          <p className="text-xs font-light" style={{ color: 'var(--missi-text-muted)' }}>
            {answeredCount}/{questions.length} answered
          </p>
          <p className="text-xs font-light capitalize" style={{ color: 'var(--missi-text-muted)' }}>
            {currentQ.difficulty} · {currentQ.type === 'true_false' ? 'True / False' : currentQ.type.toUpperCase()}
          </p>
        </div>

        <div className="flex gap-1.5">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className="flex-1 h-1.5 rounded-full transition-all"
              style={{
                background:
                  i === currentIndex
                    ? 'rgba(251,191,36,0.88)'
                    : answers[q.id]
                    ? 'rgba(52,211,153,0.52)'
                    : 'var(--missi-text-muted)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className="rounded-[30px] p-6 md:p-7"
          style={{
            background: 'linear-gradient(180deg, rgba(10,10,14,0.9), rgba(18,18,24,0.86))',
            border: '1px solid var(--missi-border)',
            boxShadow: '0 28px 70px -42px rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
              <span className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'var(--missi-text-secondary)' }}>
                Question {currentIndex + 1}
              </span>
            </div>
            <span className="text-[11px] font-light capitalize" style={{ color: 'var(--missi-text-muted)' }}>
              {currentQ.type === 'true_false' ? 'True / False' : currentQ.type.toUpperCase()}
            </span>
          </div>

          <div className="text-lg md:text-[1.45rem] font-light leading-relaxed mb-6" style={{ color: 'var(--missi-text-primary)' }}>
            <MathText text={currentQ.questionText} />
          </div>
          {currentQ.options.length > 0 ? (
            <div className="flex flex-col gap-3">
              {currentQ.options.map((opt, oi) => {
                const selected = answers[currentQ.id] === opt
                const label = String.fromCharCode(65 + oi)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(currentQ.id, opt)}
                    className="text-left px-4 md:px-5 py-4 rounded-[24px] text-sm font-light transition-all flex items-center gap-4"
                    style={{
                      background: selected ? 'rgba(251,191,36,0.14)' : 'var(--missi-surface)',
                      border: selected
                        ? '1px solid rgba(251,191,36,0.32)'
                        : '1px solid var(--missi-text-muted)',
                      color: selected ? '#FBBF24' : 'var(--missi-text-primary)',
                      cursor: 'pointer',
                      boxShadow: selected ? '0 18px 44px -32px rgba(251,191,36,0.32)' : 'none',
                    }}
                  >
                    <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold leading-none"
                      style={{
                        background: selected ? 'rgba(251,191,36,0.2)' : 'var(--missi-border)',
                        color: selected ? '#FBBF24' : 'var(--missi-text-secondary)',
                      }}>
                      {label}
                    </span>
                    <div className="min-w-0 flex-1 leading-relaxed">
                      <MathText text={opt} />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <input
              type="text"
              placeholder="Enter your answer..."
              value={answers[currentQ.id] ?? ''}
              onChange={(e) => handleSelect(currentQ.id, e.target.value)}
              className="w-full px-5 py-4 rounded-[24px] text-sm font-light outline-none"
              style={{
                background: 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-text-primary)',
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <p className="text-sm text-center" style={{ color: 'rgba(239,68,68,0.82)' }}>{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={isFirst}
          className="flex items-center justify-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
            color: isFirst ? 'var(--missi-text-muted)' : 'var(--missi-text-secondary)',
            cursor: isFirst ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            className="flex-1 py-3.5 rounded-2xl text-sm font-medium transition-all"
            style={{
              background: allAnswered ? 'var(--missi-border)' : 'var(--missi-border)',
              color: allAnswered ? 'var(--missi-surface)' : 'var(--missi-text-muted)',
              cursor: allAnswered && !isSubmitting ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting ? 'Checking...' : 'Submit answers'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-1 py-3.5 rounded-2xl text-sm font-medium transition-all"
            style={{
              background: currentAnswered ? 'var(--missi-border)' : 'var(--missi-surface)',
              border: currentAnswered ? '1px solid var(--missi-border)' : '1px solid var(--missi-border)',
              color: currentAnswered ? 'var(--missi-surface)' : 'var(--missi-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ResultsView({
  result,
  onRetry,
  userAnswers,
}: {
  result: SubmitResult
  onRetry: () => void
  userAnswers: Record<string, string>
}) {
  const { score, xpEarned, encouragement, session } = result
  const pctColor = score.pct >= 75 ? '#34D399' : score.pct >= 50 ? '#FBBF24' : '#F87171'

  // Use session.questions from the submit response — these have correctAnswer & explanation
  const reviewQuestions = session.questions ?? []

  // Net XP display: positive = earned, negative = deducted
  const xpPositive = xpEarned > 0
  const xpLabel = xpPositive ? `+${xpEarned} XP earned` : `${xpEarned} XP deducted`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4"
    >
      <div
        className="rounded-[30px] p-6 md:p-7 text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.92), rgba(18,18,24,0.88))',
          border: '1px solid var(--missi-border)',
          boxShadow: '0 28px 80px -42px rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
          style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
          <span className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'var(--missi-text-secondary)' }}>
            Quiz Review
          </span>
        </div>
        <p className="text-5xl font-light mb-1" style={{ color: pctColor }}>
          {score.pct}%
        </p>
        <p className="text-sm font-light mb-4" style={{ color: 'var(--missi-text-muted)' }}>
          {score.correct}/{score.total} correct · {score.totalMarks} marks
        </p>
        <p className="text-base font-light leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--missi-text-secondary)' }}>
          {encouragement}
        </p>
        {xpEarned !== 0 && (
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: xpPositive ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
              border: xpPositive ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(248,113,113,0.2)',
              color: xpPositive ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.85)',
            }}>
            <Zap className="w-3 h-3" />
            {xpLabel}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {reviewQuestions.map((q, i) => {
          const userAns = userAnswers[q.id] ?? session.userAnswers?.[q.id] ?? ''
          const isCorrect = userAns.trim().toLowerCase() === (q.correctAnswer ?? '').trim().toLowerCase()
          return (
            <div
              key={q.id}
              className="rounded-[24px] px-4 md:px-5 py-4 md:py-5"
              style={{
                background: isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: isCorrect ? '1px solid rgba(16,185,129,0.16)' : '1px solid rgba(239,68,68,0.16)',
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: isCorrect ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)' }}>
                  {isCorrect
                    ? <Check className="w-2.5 h-2.5" style={{ color: '#34D399' }} strokeWidth={2.5} />
                    : <X className="w-2.5 h-2.5" style={{ color: '#F87171' }} strokeWidth={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--missi-text-muted)' }}>
                    Question {i + 1}
                  </p>
                  <div className="text-sm font-light leading-relaxed" style={{ color: 'var(--missi-text-primary)' }}>
                  <MathText text={q.questionText} />
                  </div>
                </div>
              </div>
              <div className="text-xs font-light ml-9 mb-2" style={{
                color: isCorrect ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)',
              }}>
                Your answer: <MathText text={userAns || '(not answered)'} />
              </div>
              {!isCorrect && q.correctAnswer && (
                <div className="text-xs font-light ml-9 mb-2" style={{ color: 'rgba(52,211,153,0.82)' }}>
                  Correct answer: <MathText text={q.correctAnswer} />
                </div>
              )}
              {q.explanation && (
                <div className="text-xs font-light ml-9 leading-relaxed mt-1" style={{ color: 'var(--missi-text-secondary)' }}>
                  <MathText text={q.explanation} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
            color: 'var(--missi-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Try again
        </button>
        <Link
          href="/chat"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium"
          style={{
            background: 'var(--missi-border)',
            border: '1px solid var(--missi-border)',
            color: 'var(--missi-surface)',
            textDecoration: 'none',
          }}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Discuss in chat
        </Link>
      </div>
    </motion.div>
  )
}
