import { describe, it, expect } from 'vitest'
import { createLocalSessionToken, readLocalSessionToken } from '@/lib/exam-buddy/session-token'
import type { QuizSession } from '@/types/exam-buddy'

describe('exam-buddy session-token', () => {
  it('creates and reads a valid session token', async () => {
    const session: QuizSession = {
      id: 'session-123',
      userId: 'user-456',
      examTarget: 'jee_mains',
      subject: 'physics',
      topic: 'Kinematics',
      difficulty: 'medium',
      questions: [],
      userAnswers: {}, score: 0, totalMarks: null, completedAt: null, createdAt: Date.now(), xpEarned: 0,
    }

    const token = await createLocalSessionToken(session)
    expect(typeof token).toBe('string')
    expect(token).toContain('.')

    const readSession = await readLocalSessionToken(token)
    expect(readSession).not.toBeNull()
    expect(readSession).toEqual(session)
  })

  it('returns null for missing parts (no dot)', async () => {
    const result = await readLocalSessionToken('invalidtokenwithoutdot')
    expect(result).toBeNull()
  })

  it('returns null for missing iv or data part', async () => {
    const result1 = await readLocalSessionToken('.datapart')
    expect(result1).toBeNull()

    const result2 = await readLocalSessionToken('ivpart.')
    expect(result2).toBeNull()
  })

  it('returns null for invalid base64 (crypto failure)', async () => {
    // Contains characters that are invalid in base64url or padding
    const result = await readLocalSessionToken('!!!.!!!')
    expect(result).toBeNull()
  })

  it('returns null for tampered data part (decryption failure)', async () => {
    const session: QuizSession = {
      id: 'session-123',
      userId: 'user-456',
      examTarget: 'jee_mains',
      subject: 'physics',
      topic: 'Kinematics',
      difficulty: 'medium',
      questions: [],
      userAnswers: {}, score: 0, totalMarks: null, completedAt: null, createdAt: Date.now(), xpEarned: 0,
    }

    const token = await createLocalSessionToken(session)
    const [ivPart, dataPart] = token.split('.')

    // Tamper with the data part
    const tamperedDataPart = dataPart.slice(0, -1) + (dataPart.endsWith('A') ? 'B' : 'A')
    const tamperedToken = `${ivPart}.${tamperedDataPart}`

    const result = await readLocalSessionToken(tamperedToken)
    expect(result).toBeNull()
  })

  it('returns null for tampered iv part (decryption failure)', async () => {
    const session: QuizSession = {
      id: 'session-123',
      userId: 'user-456',
      examTarget: 'jee_mains',
      subject: 'physics',
      topic: 'Kinematics',
      difficulty: 'medium',
      questions: [],
      userAnswers: {}, score: 0, totalMarks: null, completedAt: null, createdAt: Date.now(), xpEarned: 0,
    }

    const token = await createLocalSessionToken(session)
    const [ivPart, dataPart] = token.split('.')

    // Tamper with the iv part
    const tamperedIvPart = ivPart.slice(0, -1) + (ivPart.endsWith('A') ? 'B' : 'A')
    const tamperedToken = `${tamperedIvPart}.${dataPart}`

    const result = await readLocalSessionToken(tamperedToken)
    expect(result).toBeNull()
  })
})
