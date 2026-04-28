import { describe, it, expect, vi } from 'vitest'
import { buildExamBuddyModifier } from '@/lib/exam-buddy/exam-prompt'
import type { ExamBuddyProfile, ExamBuddySessionContext } from '@/types/exam-buddy'

vi.mock('@/lib/memory/memory-sanitizer', () => ({
  // Simple mock to just return the string (you can test sanitizer behavior separately)
  // But wait, to be safe, we will just echo it back.
  sanitizeMemories: vi.fn((input: string) => input),
}))

describe('buildExamBuddyModifier', () => {
  const baseContext: ExamBuddySessionContext = {
    examTarget: 'jee_mains',
    mode: 'doubt',
  }

  const baseProfile: ExamBuddyProfile = {
    userId: 'user-1',
    examTarget: 'jee_mains',
    weakSubjects: [],
    studyStreak: 0,
    lastStudyDate: '',
    totalQuizzesCompleted: 0,
    xp: 0,
    level: 1,
  }

  it('should generate a valid prompt modifier with minimum context (no profile)', () => {
    const modifier = buildExamBuddyModifier(null, baseContext)

    expect(modifier).toContain('── EXAM BUDDY MODE ──')
    expect(modifier).toContain('Exam Target: JEE Mains') // Maps from 'jee_mains' to 'JEE Mains'
    expect(modifier).toContain('CURRENT MODE: The user has a doubt or question.')
    expect(modifier).toContain('LANGUAGE RULES:')
  })

  it('should map unknown exam target to itself', () => {
    const context: ExamBuddySessionContext = {
      examTarget: 'unknown_exam' as any,
      mode: 'doubt',
    }
    const modifier = buildExamBuddyModifier(null, context)
    expect(modifier).toContain('Exam Target: unknown_exam')
  })

  it('should map unknown mode to doubt mode instruction', () => {
    const context: ExamBuddySessionContext = {
      examTarget: 'neet',
      mode: 'unknown_mode' as any,
    }
    const modifier = buildExamBuddyModifier(null, context)
    expect(modifier).toContain('CURRENT MODE: The user has a doubt or question. Answer clearly and precisely.')
  })

  it('should include current subject and topic if provided in context', () => {
    const context: ExamBuddySessionContext = {
      ...baseContext,
      currentSubject: 'Physics',
      currentTopic: 'Newton Laws',
    }
    const modifier = buildExamBuddyModifier(null, context)
    expect(modifier).toContain('Current Subject: Physics')
    expect(modifier).toContain('Current Topic: Newton Laws')
  })

  it('should include sanitized weak subjects from profile (max 5)', () => {
    const profile: ExamBuddyProfile = {
      ...baseProfile,
      weakSubjects: ['Math', 'Physics', 'Chemistry', 'Biology', 'English', 'History'],
    }
    const modifier = buildExamBuddyModifier(profile, baseContext)

    // Only the first 5 should be included
    expect(modifier).toContain("User's Weak Areas: Math, Physics, Chemistry, Biology, English")
    expect(modifier).not.toContain('History')
    expect(modifier).toContain('Focus extra attention on these topics when relevant.')
  })

  it('should include study streak and total quizzes if greater than 0', () => {
    const profile: ExamBuddyProfile = {
      ...baseProfile,
      studyStreak: 5,
      totalQuizzesCompleted: 42,
    }
    const modifier = buildExamBuddyModifier(profile, baseContext)

    expect(modifier).toContain('Study Streak: 5 day(s) — acknowledge this and keep the user motivated.')
    expect(modifier).toContain('Total Quizzes Completed: 42')
  })

  it('should respect MAX_MODIFIER_LEN limit', () => {
    const longContext: ExamBuddySessionContext = {
      ...baseContext,
      // Creating a very long subject string
      currentSubject: 'A'.repeat(5000),
    }

    const modifier = buildExamBuddyModifier(null, longContext)
    expect(modifier.length).toBeLessThanOrEqual(3000)
  })

  it('should include quiz rules when mode is quiz', () => {
    const context: ExamBuddySessionContext = {
      ...baseContext,
      mode: 'quiz',
    }

    const modifier = buildExamBuddyModifier(null, context)
    expect(modifier).toContain('QUIZ RULES (when in quiz mode):')
  })
})
