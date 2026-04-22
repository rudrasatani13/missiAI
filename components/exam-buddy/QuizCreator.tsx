'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, BookOpen, Brain, CheckCircle2, Layers3, SlidersHorizontal } from 'lucide-react'
import { QuizView } from './QuizView'
import { FocusModeBadge } from './FocusModeBadge'
import { useFetchBilling } from '@/hooks/useBilling'
import { PLANS } from '@/types/billing'
import type { PlanId } from '@/types/billing'
import type { ExamSubject, QuizDifficulty, QuizQuestionType, QuizSession } from '@/types/exam-buddy'

const SUBJECTS: { value: ExamSubject; label: string }[] = [
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'biology', label: 'Biology' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'polity', label: 'Polity' },
  { value: 'economics', label: 'Economics' },
  { value: 'english', label: 'English' },
  { value: 'general_studies', label: 'General Studies' },
  { value: 'aptitude', label: 'Aptitude' },
]

const TOPIC_SUGGESTIONS: Partial<Record<ExamSubject, string[]>> = {
  physics: ['Newton Laws', 'Work Energy Power', 'Electrostatics'],
  chemistry: ['Chemical Bonding', 'Thermodynamics', 'Organic Reactions'],
  mathematics: ['Algebra', 'Calculus', 'Matrices'],
  biology: ['Genetics', 'Photosynthesis', 'Human Physiology'],
  history: ['French Revolution', 'Modern India', 'World Wars'],
  geography: ['Climate', 'Rivers', 'Resources'],
  polity: ['Constitution', 'Parliament', 'Fundamental Rights'],
  economics: ['Demand and Supply', 'National Income', 'Inflation'],
  english: ['Grammar', 'Reading Comprehension', 'Vocabulary'],
  general_studies: ['Current Affairs', 'Science and Tech', 'Indian Economy'],
  aptitude: ['Percentages', 'Time and Work', 'Number System'],
}

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20]

interface QuizCreatorProps {
  initialSubject?: ExamSubject
  initialTopic?: string
  onClose?: () => void
}

type Step = 'subject' | 'topic' | 'settings' | 'loading' | 'quiz'

export function QuizCreator({ initialSubject, initialTopic, onClose }: QuizCreatorProps) {
  const { user } = useUser()
  const { plan } = useFetchBilling()
  const [step, setStep] = useState<Step>(initialSubject ? 'topic' : 'subject')
  const [subject, setSubject] = useState<ExamSubject | null>(initialSubject ?? null)
  const [topic, setTopic] = useState(initialTopic ?? '')
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium')
  const [questionCount, setQuestionCount] = useState(5)
  const [questionTypes, setQuestionTypes] = useState<QuizQuestionType[]>(['mcq'])
  const [session, setSession] = useState<QuizSession | null>(null)
  const [localSessionToken, setLocalSessionToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const metadataPlan = (user?.publicMetadata as { plan?: string } | undefined)?.plan
  const fallbackPlanId: PlanId = metadataPlan === 'plus' || metadataPlan === 'pro' ? metadataPlan : 'free'
  const activePlan = plan ?? PLANS[fallbackPlanId]
  const maxQuestionsPerQuiz = activePlan.examBuddyMaxQuestionsPerQuiz
  const quotaSummary = `${activePlan.examBuddyQuizGenerationsPerHour}/h · ${activePlan.examBuddyQuizGenerationsPerDay}/day · ${activePlan.examBuddyQuizGenerationsPerMonth}/month`

  useEffect(() => {
    setQuestionCount((current) => Math.min(current, maxQuestionsPerQuiz))
  }, [maxQuestionsPerQuiz])

  const toggleType = (t: QuizQuestionType) => {
    setQuestionTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t],
    )
  }

  const handleGenerate = async () => {
    if (!subject || !topic.trim()) return
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/v1/exam-buddy/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, topic, difficulty, questionCount, questionTypes }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Generation failed')
        setStep('settings')
        return
      }
      setLocalSessionToken(typeof data.localSessionToken === 'string' ? data.localSessionToken : null)
      setSession(data.session as QuizSession)
      setStep('quiz')
    } catch {
      setError('Network error — please try again')
      setStep('settings')
    }
  }

  const handleRetry = () => {
    setSession(null)
    setLocalSessionToken(null)
    setStep('subject')
    setSubject(null)
    setTopic('')
  }

  if (step === 'quiz' && session) {
    return <QuizView session={session} onRetry={handleRetry} localSessionToken={localSessionToken ?? undefined} />
  }

  if (step === 'loading') {
    return (
      <div
        className="rounded-[26px] sm:rounded-[30px] p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center gap-5"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.94), rgba(18,18,24,0.9))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 28px 80px -42px rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <FocusModeBadge />
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        <div className="text-center">
          <p className="text-lg font-light mb-1" style={{ color: 'rgba(255,255,255,0.94)' }}>
            Building your quiz
          </p>
          <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.46)' }}>
            Generating focused questions for {subject?.replace('_', ' ') ?? 'your subject'}{topic.trim() ? ` · ${topic.trim()}` : ''}.
          </p>
        </div>
      </div>
    )
  }

  const selectedTypes = questionTypes.map((type) => type === 'true_false' ? 'T/F' : type.toUpperCase())
  const activeStepIndex = step === 'subject' ? 0 : step === 'topic' ? 1 : 2
  const progressSteps = [
    { key: 'subject', label: 'Subject' },
    { key: 'topic', label: 'Topic' },
    { key: 'settings', label: 'Settings' },
  ]
  const suggestionChips = subject ? TOPIC_SUGGESTIONS[subject] ?? [] : []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]"
    >
      <div
        className="order-2 xl:order-1 rounded-[26px] sm:rounded-[30px] p-4 sm:p-5 md:p-6 h-full min-w-0"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.9), rgba(18,18,24,0.86))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 28px 70px -42px rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="mb-5">
          <FocusModeBadge label="Focus Setup" />
        </div>

        <div className="flex flex-col gap-3 mb-6">
          {progressSteps.map((item, index) => {
            const isActive = index === activeStepIndex
            const isDone = index < activeStepIndex
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-2xl px-3 py-3"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)',
                  border: isActive ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                  style={{
                    background: isDone ? 'rgba(16,185,129,0.14)' : isActive ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.08)',
                    color: isDone ? '#34D399' : isActive ? '#FBBF24' : 'rgba(255,255,255,0.42)',
                  }}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : index + 1}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.66)' }}>
                    {item.label}
                  </p>
                  <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    {index === 0 ? 'Choose what you want to practice' : index === 1 ? 'Lock in a specific concept' : 'Tune the round before generating'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-[24px] p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4" style={{ color: '#2563EB' }} />
            <p className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.34)' }}>
              Session summary
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <SummaryRow label="Plan" value={activePlan.name} />
            <SummaryRow label="Subject" value={subject ? SUBJECTS.find((item) => item.value === subject)?.label ?? subject : 'Not selected'} />
            <SummaryRow label="Topic" value={topic.trim() || 'Add a topic'} />
            <SummaryRow label="Difficulty" value={difficulty} />
            <SummaryRow label="Questions" value={`${questionCount}`} />
            <SummaryRow label="Limits" value={quotaSummary} />
            <SummaryRow label="Types" value={selectedTypes.join(', ')} />
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-4 py-3 rounded-2xl text-xs font-medium"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.58)', cursor: 'pointer' }}
          >
            Close
          </button>
        )}
      </div>

      <div
        className="order-1 xl:order-2 rounded-[26px] sm:rounded-[30px] p-4 sm:p-5 md:p-7 min-w-0"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.9), rgba(18,18,24,0.86))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 28px 70px -42px rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5 sm:mb-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.24em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>
              Step {activeStepIndex + 1} of 3
            </p>
            <h2 className="text-2xl md:text-[2.3rem] font-light leading-tight" style={{ color: 'rgba(255,255,255,0.96)' }}>
              {step === 'subject' ? 'Pick your subject' : step === 'topic' ? 'Choose the exact topic' : 'Tune your quiz round'}
            </h2>
          </div>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {step === 'subject' ? <Layers3 className="w-4 h-4" style={{ color: '#FBBF24' }} /> : step === 'topic' ? <BookOpen className="w-4 h-4" style={{ color: '#60A5FA' }} /> : <SlidersHorizontal className="w-4 h-4" style={{ color: '#A78BFA' }} />}
          </div>
        </div>

        {step === 'subject' && (
          <>
            <p className="text-sm md:text-base font-light leading-7 mb-6" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Start with the subject you want to strengthen right now. Keep it simple and keep the session focused.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {SUBJECTS.map((s) => {
                const selectedSubject = subject === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => { setSubject(s.value); setStep('topic') }}
                    className="px-4 py-4 rounded-[22px] text-left transition-all"
                    style={{
                      background: selectedSubject ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selectedSubject ? '1px solid rgba(251,191,36,0.26)' : '1px solid rgba(255,255,255,0.07)',
                      color: selectedSubject ? '#FBBF24' : 'rgba(255,255,255,0.88)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="text-[10px] font-semibold tracking-[0.22em] uppercase block mb-2" style={{ color: 'rgba(255,255,255,0.28)' }}>
                      Subject
                    </span>
                    <span className="text-sm font-medium block">{s.label}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {step === 'topic' && (
          <>
            <p className="text-sm md:text-base font-light leading-7 mb-6" style={{ color: 'rgba(255,255,255,0.52)' }}>
              Add a precise topic so the questions stay sharp. Short, specific topics work best.
            </p>
            <div className="rounded-[24px] p-4 mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>
                Selected subject
              </p>
              <p className="text-sm font-medium capitalize" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {subject?.replace('_', ' ')}
              </p>
            </div>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 100))}
              placeholder="e.g. Newton's Laws, Photosynthesis, French Revolution..."
              autoFocus
              className="w-full px-5 py-4 rounded-[24px] text-sm font-light outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.92)',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && topic.trim()) setStep('settings') }}
            />
            {suggestionChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {suggestionChips.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTopic(item)}
                    className="px-3 py-2 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.64)', cursor: 'pointer' }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button type="button" onClick={() => setStep('subject')}
                className="flex-1 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.58)', cursor: 'pointer' }}>
                Back
              </button>
              <button type="button" onClick={() => setStep('settings')} disabled={!topic.trim()}
                className="flex-1 py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2"
                style={{
                  background: topic.trim() ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.08)',
                  color: topic.trim() ? '#0a0a0f' : 'rgba(255,255,255,0.3)',
                  cursor: topic.trim() ? 'pointer' : 'not-allowed',
                }}>
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {step === 'settings' && (
          <>
            <div className="grid gap-4 md:grid-cols-2 mb-5">
              <div className="rounded-[24px] p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>Subject</p>
                <p className="text-sm font-medium capitalize" style={{ color: 'rgba(255,255,255,0.9)' }}>{subject?.replace('_', ' ')}</p>
              </div>
              <div className="rounded-[24px] p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>Topic</p>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{topic.trim()}</p>
              </div>
            </div>

            <div className="rounded-[24px] p-5 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>Current plan</p>
                  <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{activePlan.name}</p>
                  <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.44)' }}>
                    Up to {maxQuestionsPerQuiz} questions per quiz · {quotaSummary}
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center px-3 py-2 rounded-2xl text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.72)' }}
                >
                  {activePlan.id === 'pro' ? 'Manage plan' : 'Upgrade'}
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <LimitPill label="Hourly" value={`${activePlan.examBuddyQuizGenerationsPerHour} quizzes`} />
                <LimitPill label="Daily" value={`${activePlan.examBuddyQuizGenerationsPerDay} quizzes`} />
                <LimitPill label="Monthly" value={`${activePlan.examBuddyQuizGenerationsPerMonth} quizzes`} />
              </div>
            </div>

            <div className="rounded-[24px] p-5 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.34)' }}>Difficulty</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['easy', 'medium', 'hard', 'mixed'] as QuizDifficulty[]).map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)}
                    className="py-3 rounded-2xl text-sm font-medium capitalize transition-all"
                    style={{
                      background: difficulty === d ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.05)',
                      border: difficulty === d ? '1px solid rgba(251,191,36,0.28)' : '1px solid rgba(255,255,255,0.07)',
                      color: difficulty === d ? '#FBBF24' : 'rgba(255,255,255,0.64)',
                      cursor: 'pointer',
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] p-5 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.34)' }}>
                    Questions
                  </p>
                  <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.44)' }}>
                    Your {activePlan.name} plan supports up to {maxQuestionsPerQuiz} questions per quiz.
                  </p>
                </div>
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{questionCount}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {QUESTION_COUNT_OPTIONS.map((count) => {
                  const disabled = count > maxQuestionsPerQuiz
                  const selectedCount = questionCount === count

                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setQuestionCount(count)}
                      disabled={disabled}
                      className="py-3 rounded-2xl text-sm font-medium transition-all"
                      style={{
                        background: selectedCount ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.05)',
                        border: selectedCount ? '1px solid rgba(251,191,36,0.28)' : '1px solid rgba(255,255,255,0.07)',
                        color: disabled ? 'rgba(255,255,255,0.24)' : selectedCount ? '#FBBF24' : 'rgba(255,255,255,0.64)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      {count}
                    </button>
                  )
                })}
              </div>

              <input type="range" min={1} max={maxQuestionsPerQuiz} value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full accent-yellow-400" />

              <div className="flex items-center justify-between mt-2 text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.38)' }}>
                <span>1</span>
                <span>{maxQuestionsPerQuiz}</span>
              </div>

              {activePlan.id !== 'pro' && (
                <p className="text-[11px] font-light mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Upgrade to unlock longer quiz rounds and higher generation quotas.
                </p>
              )}
            </div>

            <div className="rounded-[24px] p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.34)' }}>Question Types</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['mcq', 'true_false', 'numerical'] as QuizQuestionType[]).map((t) => (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className="py-3 rounded-2xl text-sm font-medium transition-all"
                    style={{
                      background: questionTypes.includes(t) ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.05)',
                      border: questionTypes.includes(t) ? '1px solid rgba(96,165,250,0.26)' : '1px solid rgba(255,255,255,0.07)',
                      color: questionTypes.includes(t) ? '#60A5FA' : 'rgba(255,255,255,0.64)',
                      cursor: 'pointer',
                    }}>
                    {t === 'true_false' ? 'True / False' : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-center mt-4" style={{ color: 'rgba(239,68,68,0.82)' }}>{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button type="button" onClick={() => setStep('topic')}
                className="flex-1 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.58)', cursor: 'pointer' }}>
                Back
              </button>
              <button type="button" onClick={handleGenerate}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.96)', color: '#0a0a0f', cursor: 'pointer' }}>
                <BookOpen className="w-4 h-4" />
                Generate focus quiz
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </span>
      <span className="text-sm font-medium text-left sm:text-right" style={{ color: 'rgba(255,255,255,0.9)' }}>
        {value}
      </span>
    </div>
  )
}

function LimitPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-3 py-3"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.34)' }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
        {value}
      </p>
    </div>
  )
}
