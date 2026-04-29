import { describe, it, expect } from 'vitest'
import { createLocalSessionToken, readLocalSessionToken } from '@/lib/exam-buddy/session-token'
import type { QuizSession } from '@/types/exam-buddy'

describe('Session Token Cryptography', () => {
  const mockSession: QuizSession = {
    id: 'test-session-123',
    userId: 'user-456',
    examTarget: 'jee_mains',
    subject: 'physics',
    topic: 'Kinematics',
    difficulty: 'medium',
    questions: [
      {
        id: 'q1',
        questionText: 'What is acceleration?',
        options: ['Rate of change of velocity', 'Rate of change of distance'],
        correctAnswer: 'Rate of change of velocity',
        explanation: 'Acceleration is defined as dv/dt.',
        difficulty: 'medium',
        subject: 'physics',
        topic: 'Kinematics',
        type: 'mcq',
      },
    ],
    userAnswers: {},
    score: null,
    totalMarks: null,
    completedAt: null,
    createdAt: 1714392000000,
    xpEarned: 0,
  }

  it('should successfully create and read a valid session token', async () => {
    const token = await createLocalSessionToken(mockSession)

    // Verify token format
    expect(token).toBeTypeOf('string')
    const parts = token.split('.')
    expect(parts.length).toBe(2)
    expect(parts[0]).toBeTruthy() // IV part
    expect(parts[1]).toBeTruthy() // Data part

    // Decrypt and verify contents
    const decryptedSession = await readLocalSessionToken(token)
    expect(decryptedSession).toEqual(mockSession)
  })

  it('should return null for completely invalid token formats', async () => {
    // Missing dot
    const invalidToken1 = 'invalid_token_without_dot'
    const result1 = await readLocalSessionToken(invalidToken1)
    expect(result1).toBeNull()

    // Empty string
    const invalidToken2 = ''
    const result2 = await readLocalSessionToken(invalidToken2)
    expect(result2).toBeNull()

    // Multiple dots
    const invalidToken3 = 'part1.part2.part3'
    // While our split function might grab part1 and part2, it'll fail decryption
    const result3 = await readLocalSessionToken(invalidToken3)
    expect(result3).toBeNull()
  })

  it('should return null if the token has been tampered with', async () => {
    const validToken = await createLocalSessionToken(mockSession)
    const [ivPart, dataPart] = validToken.split('.')

    // Tamper with data part
    const tamperedDataPart = dataPart.slice(0, -5) + 'xxxxx'
    const tamperedToken1 = `${ivPart}.${tamperedDataPart}`
    const result1 = await readLocalSessionToken(tamperedToken1)
    expect(result1).toBeNull()

    // Tamper with IV part
    const tamperedIvPart = ivPart.slice(0, -2) + 'xx'
    const tamperedToken2 = `${tamperedIvPart}.${dataPart}`
    const result2 = await readLocalSessionToken(tamperedToken2)
    expect(result2).toBeNull()
  })

  it('should handle malformed base64url inputs gracefully', async () => {
    const validToken = await createLocalSessionToken(mockSession)
    const [ivPart, dataPart] = validToken.split('.')

    // Pass invalid characters to base64url conversion
    const invalidBase64Token = `${ivPart}.!@#$%^&*()`
    const result = await readLocalSessionToken(invalidBase64Token)
    expect(result).toBeNull()
  })
})
