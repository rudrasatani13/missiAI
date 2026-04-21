// ─── Exam Buddy Achievement System ───────────────────────────────────────────

import type { GamificationData, Achievement } from '@/types/gamification'
import type { ExamBuddyProfile, QuizSession } from '@/types/exam-buddy'

export interface ExamAchievementContext {
  quizJustCompleted?: QuizSession
  isFirstQuiz?: boolean
}

interface ExamAchievementDef {
  id: string
  title: string
  description: string
  xpBonus: number
  check: (
    profile: ExamBuddyProfile,
    gamificationData: GamificationData,
    ctx: ExamAchievementContext,
  ) => boolean
}

// ─── Achievement Definitions ──────────────────────────────────────────────────

const EXAM_ACHIEVEMENT_REGISTRY: ExamAchievementDef[] = [
  {
    id: 'exam_first_quiz',
    title: 'First Quiz',
    description: 'Complete your first Exam Buddy quiz',
    xpBonus: 10,
    check: (_p, _g, ctx) => !!ctx.isFirstQuiz,
  },
  {
    id: 'exam_perfect_score',
    title: 'Perfect Score',
    description: 'Score 100% on a quiz',
    xpBonus: 50,
    check: (_p, _g, ctx) => {
      const quiz = ctx.quizJustCompleted
      if (!quiz || quiz.score === null || quiz.questions.length === 0) return false
      return quiz.score === quiz.questions.length
    },
  },
  {
    id: 'exam_5_quizzes',
    title: 'Quiz Addict',
    description: 'Complete 5 quizzes',
    xpBonus: 25,
    check: (profile) => profile.totalQuizzesCompleted >= 5,
  },
  {
    id: 'exam_25_quizzes',
    title: 'Consistent Learner',
    description: 'Complete 25 quizzes',
    xpBonus: 75,
    check: (profile) => profile.totalQuizzesCompleted >= 25,
  },
  {
    id: 'exam_study_streak_7',
    title: '7-Day Streak',
    description: 'Study 7 days in a row with Exam Buddy',
    xpBonus: 30,
    check: (profile) => profile.studyStreak >= 7,
  },
  {
    id: 'exam_study_streak_30',
    title: '30-Day Streak',
    description: 'Study 30 days in a row with Exam Buddy',
    xpBonus: 150,
    check: (profile) => profile.studyStreak >= 30,
  },
  {
    id: 'exam_100_correct',
    title: 'Century',
    description: 'Answer 100 questions correctly',
    xpBonus: 100,
    check: (profile) => profile.totalCorrectAnswers >= 100,
  },
  {
    id: 'exam_jee_warrior',
    title: 'JEE Warrior',
    description: 'Complete 10 JEE quizzes',
    xpBonus: 40,
    check: (profile) =>
      (profile.examTarget === 'jee_mains' || profile.examTarget === 'jee_advanced') &&
      profile.totalQuizzesCompleted >= 10,
  },
  {
    id: 'exam_neet_champion',
    title: 'NEET Champion',
    description: 'Complete 10 NEET quizzes',
    xpBonus: 40,
    check: (profile) =>
      profile.examTarget === 'neet' && profile.totalQuizzesCompleted >= 10,
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check and unlock new exam achievements.
 * Mutates `gamificationData.achievements` in place and returns the newly unlocked ones.
 * Follows the same pattern as `checkAchievements` in lib/gamification/achievements.ts.
 */
export function checkExamAchievements(
  profile: ExamBuddyProfile,
  gamificationData: GamificationData,
  ctx: ExamAchievementContext = {},
): Achievement[] {
  const newlyUnlocked: Achievement[] = []

  for (const def of EXAM_ACHIEVEMENT_REGISTRY) {
    const existing = gamificationData.achievements.find((a) => a.id === def.id)
    if (existing?.unlockedAt) continue

    if (!def.check(profile, gamificationData, ctx)) continue

    const achievement: Achievement = {
      id: def.id,
      title: def.title,
      description: def.description,
      xpBonus: def.xpBonus,
      unlockedAt: Date.now(),
    }

    const idx = gamificationData.achievements.findIndex((a) => a.id === def.id)
    if (idx >= 0) {
      gamificationData.achievements[idx] = achievement
    } else {
      gamificationData.achievements.push(achievement)
    }

    gamificationData.totalXP += def.xpBonus
    gamificationData.xpLog.push({
      source: 'achievement',
      amount: def.xpBonus,
      timestamp: Date.now(),
    })

    newlyUnlocked.push(achievement)
  }

  return newlyUnlocked
}
