'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Flame, MessageCircle, Sparkles, TrendingUp, Trophy } from 'lucide-react'
import Link from 'next/link'
import { QuizCreator } from './QuizCreator'
import { WeakTopicsCard } from './WeakTopicsCard'
import type { ExamBuddyProfile, WeakTopicRecord, ExamTarget, ExamSubject, QuizSession } from '@/types/exam-buddy'

// ─── Exam display data ────────────────────────────────────────────────────────

const EXAM_TARGETS: { value: ExamTarget; label: string; color: string }[] = [
  { value: 'jee_mains',    label: 'JEE Mains',       color: '#60A5FA' },
  { value: 'jee_advanced', label: 'JEE Advanced',    color: '#818CF8' },
  { value: 'neet',         label: 'NEET',            color: '#34D399' },
  { value: 'upsc',         label: 'UPSC',            color: '#FBBF24' },
  { value: 'cbse_10',      label: 'CBSE Class 10',   color: '#F472B6' },
  { value: 'cbse_12',      label: 'CBSE Class 12',   color: '#A78BFA' },
  { value: 'cat',          label: 'CAT',             color: '#FB923C' },
  { value: 'gate',         label: 'GATE',            color: '#2DD4BF' },
]

const EXAM_NAMES: Record<ExamTarget, string> = Object.fromEntries(
  EXAM_TARGETS.map((e) => [e.value, e.label])
) as Record<ExamTarget, string>

// ─── Onboarding view ─────────────────────────────────────────────────────────

function OnboardingView({ onComplete }: { onComplete: (profile: ExamBuddyProfile) => void }) {
  const [selected, setSelected] = useState<ExamTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = useCallback(async () => {
    if (!selected || saving) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/v1/exam-buddy/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examTarget: selected }),
      })
      const data = await res.json()
      if (data.success) {
        onComplete(data.profile)
        return
      }
      setError(typeof data.error === 'string' ? data.error : 'Unable to set up your dashboard right now.')
    } catch {
      setError('Unable to set up your dashboard right now.')
    } finally {
      setSaving(false)
    }
  }, [selected, saving, onComplete])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full py-2 sm:py-4"
    >
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div
          className="rounded-[28px] sm:rounded-[34px] p-5 sm:p-7 md:p-8"
          style={{
            background: 'linear-gradient(180deg, rgba(10,10,14,0.94), rgba(18,18,24,0.88))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px -40px rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#6D5EF5' }} />
            <span className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Focus Mode
            </span>
          </div>
          <BookOpen className="w-11 h-11 mb-5" style={{ color: 'rgba(255,255,255,0.95)' }} />
          <h2 className="text-3xl md:text-[3rem] font-light leading-[1.05] mb-4" style={{ color: 'rgba(255,255,255,0.96)' }}>
            Practice with more clarity.
          </h2>
          <p className="text-base md:text-[1.05rem] font-light leading-8 max-w-2xl" style={{ color: 'rgba(255,255,255,0.64)' }}>
            Pick your exam once and let Missi turn Exam Buddy into a calmer study space with focused quizzes, cleaner review, and clearer next steps.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 mt-8">
            {[
              { title: 'One-question flow', copy: 'Stay inside a cleaner practice rhythm with less visual noise.' },
              { title: 'Smarter recovery', copy: 'Return to weak topics without hunting through the dashboard.' },
              { title: 'Clear review', copy: 'See what went wrong, what was correct, and what to revisit.' },
            ].map((item) => {
              return (
                <div
                  key={item.title}
                  className="rounded-[24px] p-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.title}</p>
                  <p className="text-xs font-light leading-6" style={{ color: 'rgba(255,255,255,0.52)' }}>{item.copy}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className="rounded-[28px] sm:rounded-[34px] p-5 sm:p-6"
          style={{
            background: 'rgba(10,10,14,0.82)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px -40px rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <p className="text-[10px] font-semibold tracking-[0.24em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>
            Choose your exam
          </p>
          <h3 className="text-2xl font-light mb-3" style={{ color: 'rgba(255,255,255,0.96)' }}>
            Set your study path.
          </h3>
          <p className="text-sm font-light leading-7 mb-6" style={{ color: 'rgba(255,255,255,0.54)' }}>
            Keep your practice space aligned to the exam you care about most.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {EXAM_TARGETS.map((exam) => (
              <button
                key={exam.value}
                type="button"
                onClick={() => setSelected(exam.value)}
                className="rounded-[22px] px-4 py-4 text-left transition-all"
                style={{
                  background: selected === exam.value ? `${exam.color}16` : 'rgba(255,255,255,0.03)',
                  border: selected === exam.value ? `1px solid ${exam.color}55` : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: selected === exam.value ? `0 18px 40px -28px ${exam.color}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="text-[10px] font-semibold tracking-[0.2em] uppercase block mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Exam
                </span>
                <span className="text-sm font-medium block" style={{ color: selected === exam.value ? exam.color : 'rgba(255,255,255,0.9)' }}>
                  {exam.label}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={!selected || saving}
            className="w-full mt-6 py-3.5 rounded-[22px] text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{
              background: selected ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.08)',
              color: selected ? '#0a0a0f' : 'rgba(255,255,255,0.28)',
              cursor: selected && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Setting up...' : 'Continue to dashboard'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
          {error && (
            <p className="text-xs font-light mt-3 px-1" style={{ color: 'rgba(248,113,113,0.9)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView({ profile }: { profile: ExamBuddyProfile }) {
  const [weakTopics, setWeakTopics] = useState<WeakTopicRecord[]>([])
  const [recentSessions, setRecentSessions] = useState<QuizSession[]>([])
  const [activeSection, setActiveSection] = useState<'home' | 'quiz' | null>('home')
  const [practiceSubject, setPracticeSubject] = useState<ExamSubject | undefined>()
  const [practiceTopic, setPracticeTopic] = useState<string | undefined>()

  const examInfo = EXAM_TARGETS.find((e) => e.value === profile.examTarget)

  useEffect(() => {
    fetch('/api/v1/exam-buddy/weak-topics')
      .then((r) => r.json())
      .then((d) => { if (d.success) setWeakTopics(d.weakTopics) })
      .catch(() => {})

    fetch('/api/v1/exam-buddy/sessions?limit=5')
      .then((r) => r.json())
      .then((d) => { if (d.success) setRecentSessions(d.sessions) })
      .catch(() => {})
  }, [])

  const handlePractice = useCallback((topic: string, subject: ExamSubject) => {
    setPracticeSubject(subject)
    setPracticeTopic(topic)
    setActiveSection('quiz')
  }, [])

  if (activeSection === 'quiz') {
    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-3 sm:gap-4 px-1 sm:px-0">
        <button
          type="button"
          onClick={() => { setActiveSection('home'); setPracticeSubject(undefined); setPracticeTopic(undefined) }}
          className="w-fit px-0 text-left text-xs font-medium"
          style={{ color: 'rgba(255,255,255,0.5)', cursor: 'pointer', background: 'none', border: 'none' }}
        >
          ← Back
        </button>
        <QuizCreator initialSubject={practiceSubject} initialTopic={practiceTopic} />
      </div>
    )
  }

  const accuracy = profile.totalQuestionsAttempted > 0
    ? Math.round((profile.totalCorrectAnswers / profile.totalQuestionsAttempted) * 100)
    : 0

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-[30px] sm:rounded-[36px] p-5 sm:p-7 md:p-8"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,14,0.94), rgba(18,18,24,0.9))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 90px -42px rgba(0,0,0,0.94)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#6D5EF5' }} />
              <span className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.46)' }}>
                Exam Buddy
              </span>
            </div>
            <p className="text-sm font-medium mb-3" style={{ color: examInfo?.color ?? '#6D5EF5' }}>
              {EXAM_NAMES[profile.examTarget]}
            </p>
            <h2 className="text-3xl md:text-[3.2rem] font-light leading-[1.04] mb-4" style={{ color: 'rgba(255,255,255,0.96)' }}>
              Ready to study with clarity?
            </h2>
            <p className="text-base md:text-[1.05rem] font-light leading-8 max-w-xl" style={{ color: 'rgba(255,255,255,0.62)' }}>
              Practice one concept at a time, get instant feedback, and keep your next step obvious.
            </p>
          </div>

          {profile.studyStreak > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-[22px] shrink-0"
              style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)' }}>
              <Flame className="w-4 h-4" style={{ color: '#F97316' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#FDBA74' }}>{profile.studyStreak} day streak</p>
                <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.42)' }}>Keep the rhythm going</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mt-8">
          {[
            { label: 'Quizzes completed', value: profile.totalQuizzesCompleted },
            { label: 'Correct answers', value: profile.totalCorrectAnswers },
            { label: 'Accuracy', value: `${accuracy}%` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[24px] px-4 py-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-3xl font-light" style={{ color: 'rgba(255,255,255,0.94)' }}>{stat.value}</p>
              <p className="text-[11px] font-light mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            type="button"
            onClick={() => setActiveSection('quiz')}
            className="flex-1 flex items-center justify-between rounded-[22px] px-5 py-4 text-left"
            style={{ background: 'rgba(255,255,255,0.96)', color: '#0a0a0f', cursor: 'pointer' }}
          >
            <div>
              <p className="text-sm font-medium">Start focused quiz</p>
              <p className="text-xs font-light mt-1" style={{ color: 'rgba(10,10,15,0.56)' }}>Build a cleaner practice round</p>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <Link
            href="/chat"
            className="flex-1 rounded-[22px] px-5 py-4 text-left block"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4" style={{ color: '#2563EB' }} />
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>Ask Missi</p>
            </div>
            <p className="text-xs font-light leading-6" style={{ color: 'rgba(255,255,255,0.44)' }}>Switch to chat for explanations, doubts, or step-by-step help.</p>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)]">
        <div
          className="rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 md:p-7"
          style={{
            background: 'rgba(10,10,14,0.82)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 28px 70px -40px rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" style={{ color: '#2563EB' }} />
            <p className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.34)' }}>
              Practice next
            </p>
          </div>
          <h3 className="text-2xl font-light mb-2" style={{ color: 'rgba(255,255,255,0.94)' }}>
            Continue where you need it most.
          </h3>
          <p className="text-sm font-light leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.52)' }}>
            Return to weak topics or jump straight into a new focused round.
          </p>
          {weakTopics.length > 0 ? (
            <WeakTopicsCard topics={weakTopics} onPractice={handlePractice} />
          ) : (
            <div className="rounded-[24px] px-4 py-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.9)' }}>No weak topics yet</p>
              <p className="text-xs font-light leading-6 mb-4" style={{ color: 'rgba(255,255,255,0.44)' }}>
                Finish a few quizzes and Exam Buddy will start surfacing the concepts that deserve one more pass.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('quiz')}
                className="px-4 py-2.5 rounded-[18px] text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.96)', color: '#0a0a0f', cursor: 'pointer' }}
              >
                Start a quiz
              </button>
            </div>
          )}
        </div>

        <div
          className="rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 md:p-7"
          style={{
            background: 'rgba(10,10,14,0.82)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 28px 70px -40px rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <p className="text-[10px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.34)' }}>
              Recent quizzes
            </p>
          </div>
          <h3 className="text-2xl font-light mb-2" style={{ color: 'rgba(255,255,255,0.94)' }}>
            Your recent activity.
          </h3>
          <p className="text-sm font-light leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.52)' }}>
            Review the topics you practiced most recently and how each round went.
          </p>
          {recentSessions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {recentSessions.map((s) => {
                const pct = s.score !== null && s.questions.length > 0
                  ? Math.round((s.score / s.questions.length) * 100)
                  : null
                const pctColor = pct === null ? 'rgba(255,255,255,0.36)' : pct >= 75 ? '#34D399' : pct >= 50 ? '#FBBF24' : '#F87171'
                return (
                  <div
                    key={s.id}
                    className="rounded-[22px] px-4 py-4"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                          {s.topic}
                        </p>
                        <p className="text-[11px] font-light capitalize mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {s.subject.replace('_', ' ')} · {s.questions.length} questions
                        </p>
                      </div>
                      <span className="text-sm font-medium shrink-0" style={{ color: pctColor }}>
                        {pct !== null ? `${pct}%` : 'In progress'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[24px] px-4 py-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.9)' }}>No recent quizzes</p>
              <p className="text-xs font-light leading-6" style={{ color: 'rgba(255,255,255,0.44)' }}>
                Your last practice rounds will appear here once you start solving quizzes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

export function ExamBuddyHub() {
  const [profile, setProfile] = useState<ExamBuddyProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/exam-buddy/profile')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && !d.isNew) setProfile(d.profile)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="rounded-[34px] border border-white/10 bg-black/45 flex flex-col items-center justify-center py-24 gap-4 backdrop-blur-xl">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Loading your focus dashboard...
        </p>
      </div>
    )
  }

  if (!profile) {
    return <OnboardingView onComplete={setProfile} />
  }

  return <DashboardView profile={profile} />
}
