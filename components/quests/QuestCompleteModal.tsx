'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Quest } from '@/types/quests'

interface QuestCompleteModalProps {
  quest: Quest
  newAchievements?: Array<{ id: string; title: string; description: string; xpBonus: number }>
  onClose: () => void
}

export function QuestCompleteModal({
  quest,
  newAchievements = [],
  onClose,
}: QuestCompleteModalProps) {
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    const t2 = setTimeout(() => setShowStats(true), 700)
    return () => { clearTimeout(t2) }
  }, [])

  const durationDays = quest.startedAt && quest.completedAt
    ? Math.max(1, Math.ceil((quest.completedAt - quest.startedAt) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[999] flex items-center justify-center px-4"
        style={{ background: 'rgba(6,6,8,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-sm w-full text-center"
          onClick={e => e.stopPropagation()}
        >
          {/* Emoji */}
          <motion.span
            className="inline-block text-5xl mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {quest.coverEmoji}
          </motion.span>

          {/* Eyebrow */}
          <p
            className="text-[10px] font-semibold uppercase mb-3"
            style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
          >
            Quest Complete
          </p>

          {/* Title */}
          <h2
            className="text-[24px] md:text-[28px] mb-8"
            style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--missi-text-primary)', lineHeight: 1.1 }}
          >
            {quest.title}
          </h2>

          {/* Stats */}
          <motion.div
            className="flex justify-center gap-10 mb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: showStats ? 1 : 0, y: showStats ? 0 : 8 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-center">
              <p className="text-[22px] font-light" style={{ color: 'var(--missi-text-primary)' }}>
                {quest.totalXPEarned}
              </p>
              <p className="text-[10px] font-semibold uppercase mt-1"
                style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}>
                XP
              </p>
            </div>
            <div className="text-center">
              <p className="text-[22px] font-light" style={{ color: 'var(--missi-text-primary)' }}>
                {quest.totalMissions}
              </p>
              <p className="text-[10px] font-semibold uppercase mt-1"
                style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}>
                Missions
              </p>
            </div>
            {durationDays && (
              <div className="text-center">
                <p className="text-[22px] font-light" style={{ color: 'var(--missi-text-primary)' }}>
                  {durationDays}
                </p>
                <p className="text-[10px] font-semibold uppercase mt-1"
                  style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}>
                  Days
                </p>
              </div>
            )}
          </motion.div>

          {/* Achievements */}
          {newAchievements.length > 0 && showStats && (
            <motion.div
              className="mb-8 space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <p className="text-[10px] font-semibold uppercase mb-3"
                style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}>
                Unlocked
              </p>
              {newAchievements.map(a => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: '1px solid var(--missi-border)' }}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: 'var(--missi-text-primary)' }}>
                      {a.title}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--missi-text-muted)' }}>
                      {a.description}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--missi-text-muted)' }}>
                    +{a.xpBonus}
                  </span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Continue button */}
          <button
            onClick={onClose}
            className="w-full max-w-xs mx-auto rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
            style={{ background: 'var(--missi-nav-text-active)', border: '1px solid var(--missi-border)', color: 'var(--missi-bg)', cursor: 'pointer' }}
          >
            Continue
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
