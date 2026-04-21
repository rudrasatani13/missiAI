'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { QuestCategory, QuestDifficulty } from '@/types/quests'

interface QuestCreatorProps {
  onSubmit: (data: {
    userGoal: string
    category: QuestCategory
    difficulty: QuestDifficulty
    targetDurationDays: number
  }) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

const CATEGORIES: Array<{
  id: QuestCategory
  label: string
  emoji: string
}> = [
  { id: 'health', label: 'Health', emoji: '💪' },
  { id: 'learning', label: 'Learning', emoji: '📚' },
  { id: 'creativity', label: 'Creativity', emoji: '🎨' },
  { id: 'relationships', label: 'Relationships', emoji: '💛' },
  { id: 'career', label: 'Career', emoji: '💼' },
  { id: 'mindfulness', label: 'Mindfulness', emoji: '🧘' },
  { id: 'other', label: 'Other', emoji: '✨' },
]

const DIFFICULTIES: Array<{
  id: QuestDifficulty
  label: string
  desc: string
}> = [
  { id: 'easy', label: 'Gentle', desc: '3 missions per phase' },
  { id: 'medium', label: 'Steady', desc: '4 missions per phase' },
  { id: 'hard', label: 'Ambitious', desc: '5 missions per phase' },
]

const DURATIONS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
]

export function QuestCreator({ onSubmit, onCancel, isLoading }: QuestCreatorProps) {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState('')
  const [category, setCategory] = useState<QuestCategory>('other')
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('medium')
  const [duration, setDuration] = useState(30)

  const handleSubmit = async () => {
    if (!goal.trim() || goal.trim().length < 10) return
    await onSubmit({
      userGoal: goal.trim(),
      category,
      difficulty,
      targetDurationDays: duration,
    })
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-10">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-[2px] rounded-full transition-all duration-300"
            style={{
              width: i === step ? 32 : 12,
              background: i <= step ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </div>

      {/* Step 0: Goal input */}
      {step === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p
            className="mb-3 text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
          >
            Your goal
          </p>
          <h2
            className="text-[24px] md:text-[28px] mb-6"
            style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            What do you want to achieve?
          </h2>

          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="e.g. Learn basic conversational Spanish in 2 months"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-all mb-2"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'inherit',
            }}
          />
          <p className="text-[10px] mb-8" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {goal.length}/500
          </p>

          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => setStep(1)}
              disabled={goal.trim().length < 10}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97] disabled:opacity-20"
              style={{
                background: goal.trim().length >= 10 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: goal.trim().length >= 10 ? '#0a0a0f' : 'rgba(255,255,255,0.35)',
                cursor: goal.trim().length >= 10 ? 'pointer' : 'default',
              }}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 1: Category */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p
            className="mb-3 text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
          >
            Category
          </p>
          <h2
            className="text-[24px] md:text-[28px] mb-8"
            style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            What area is this?
          </h2>

          <div className="space-y-1 mb-8">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className="w-full flex items-center gap-3 py-3.5 transition-colors active:scale-[0.99]"
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  opacity: category === cat.id ? 1 : 0.5,
                }}
              >
                <span className="text-base">{cat.emoji}</span>
                <span
                  className="text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.85)' }}
                >
                  {cat.label}
                </span>
                {category === cat.id && (
                  <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>●</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => setStep(0)}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            >
              Back
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.9)', color: '#0a0a0f', cursor: 'pointer' }}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 2: Duration + Difficulty */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p
            className="mb-3 text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
          >
            Configuration
          </p>
          <h2
            className="text-[24px] md:text-[28px] mb-8"
            style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            How ambitious?
          </h2>

          {/* Duration */}
          <p className="text-[10px] font-semibold uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
            Duration
          </p>
          <div className="flex flex-wrap gap-2 mb-8">
            {DURATIONS.map(d => (
              <button
                key={d.days}
                onClick={() => setDuration(d.days)}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-colors active:scale-[0.97]"
                style={{
                  background: duration === d.days ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: `1px solid ${duration === d.days ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  color: duration === d.days ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Pace */}
          <p className="text-[10px] font-semibold uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
            Pace
          </p>
          <div className="space-y-1 mb-8">
            {DIFFICULTIES.map(diff => (
              <button
                key={diff.id}
                onClick={() => setDifficulty(diff.id)}
                className="w-full flex items-center justify-between py-3 transition-colors active:scale-[0.99]"
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  opacity: difficulty === diff.id ? 1 : 0.5,
                }}
              >
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {diff.label}
                </span>
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {diff.desc}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97] disabled:opacity-50"
              style={{
                background: isLoading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: isLoading ? 'rgba(255,255,255,0.35)' : '#0a0a0f',
                cursor: isLoading ? 'wait' : 'pointer',
              }}
            >
              {isLoading ? 'Generating…' : 'Create Quest'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
