import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  analyzeMoodFromConversation,
  generateWeeklyInsight,
} from '@/lib/mood/mood-analyzer'
import type { MoodEntry } from '@/types/mood'

// ─── Mock vertex-client ───────────────────────────────────────────────────────

vi.mock('@/lib/ai/vertex-client', () => ({
  geminiGenerate: vi.fn(),
}))

import { geminiGenerate } from '@/lib/ai/vertex-client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockGeminiOk(text: string) {
  vi.mocked(geminiGenerate).mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response)
}

function mockGeminiError() {
  vi.mocked(geminiGenerate).mockRejectedValue(new Error('Network error'))
}

function mockGeminiBadStatus() {
  vi.mocked(geminiGenerate).mockResolvedValue({
    ok: false,
    json: async () => ({}),
  } as unknown as Response)
}

const TODAY = '2025-04-13'

// ─── analyzeMoodFromConversation ──────────────────────────────────────────────

describe('analyzeMoodFromConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid MoodEntry on well-formed Gemini response', async () => {
    mockGeminiOk(
      JSON.stringify({ score: 8, label: 'calm', trigger: 'planning weekend trip' }),
    )

    const result = await analyzeMoodFromConversation(
      'User: I am excited about the weekend!\nMissi: That sounds great!',
      TODAY,
    )

    expect(result.score).toBe(8)
    expect(result.label).toBe('calm')
    expect(result.trigger).toBe('planning weekend trip')
    expect(result.date).toBe(TODAY)
    expect(result.recordedAt).toBeGreaterThan(0)
  })

  it('returns safe fallback when Gemini returns malformed JSON', async () => {
    mockGeminiOk('This is not JSON at all.')

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
    )

    expect(result.score).toBe(5)
    expect(result.label).toBe('neutral')
    expect(result.trigger).toBe('general conversation')
    expect(result.date).toBe(TODAY)
  })

  it('returns safe fallback when score is out of range', async () => {
    mockGeminiOk(JSON.stringify({ score: 11, label: 'calm', trigger: 'test' }))

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
    )

    expect(result.score).toBe(5)
    expect(result.label).toBe('neutral')
  })

  it('returns safe fallback when label is invalid', async () => {
    mockGeminiOk(
      JSON.stringify({ score: 7, label: 'unknown_feeling', trigger: 'test' }),
    )

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
    )

    expect(result.score).toBe(5)
    expect(result.label).toBe('neutral')
  })

  it('returns safe fallback when Gemini call throws', async () => {
    mockGeminiError()

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
    )

    expect(result.score).toBe(5)
    expect(result.label).toBe('neutral')
  })

  it('returns safe fallback on non-ok HTTP status', async () => {
    mockGeminiBadStatus()

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
    )

    expect(result.score).toBe(5)
    expect(result.label).toBe('neutral')
  })

  it('correctly trims transcript to last 800 characters', async () => {
    // Build a string where only the last 800 chars are meaningful
    // Prefix: 500 unique chars ("PREFIX"+...), then 800 chars ending with "TAIL"
    const prefix = 'Z'.repeat(500)
    const tail = 'B'.repeat(796) + 'TAIL'
    const longTranscript = prefix + tail  // 1304 chars total
    mockGeminiOk(JSON.stringify({ score: 6, label: 'neutral', trigger: 'long chat' }))

    await analyzeMoodFromConversation(longTranscript, TODAY)

    // Verify the request body sent to Gemini used the trimmed text
    const callArgs = vi.mocked(geminiGenerate).mock.calls[0]
    const body = callArgs[1] as Record<string, unknown>
    const contents = body.contents as Array<{ role: string; parts: Array<{ text: string }> }>
    const sentText = contents[0].parts[0].text

    expect(sentText.length).toBeLessThanOrEqual(800)
    expect(sentText).toContain('TAIL')
    // The first-500-char Z prefix should have been trimmed away
    expect(sentText).not.toContain('Z')
  })

  it('strips markdown code fences from Gemini response', async () => {
    mockGeminiOk(
      '```json\n{"score":9,"label":"joyful","trigger":"birthday celebration"}\n```',
    )

    const result = await analyzeMoodFromConversation(
      'We celebrated my birthday!',
      TODAY,
    )

    expect(result.score).toBe(9)
    expect(result.label).toBe('joyful')
  })

  it('attaches sessionId when provided', async () => {
    mockGeminiOk(
      JSON.stringify({ score: 5, label: 'neutral', trigger: 'general' }),
    )

    const result = await analyzeMoodFromConversation(
      'some transcript',
      TODAY,
      'session-abc',
    )

    expect(result.sessionId).toBe('session-abc')
  })
})

// ─── generateWeeklyInsight ────────────────────────────────────────────────────

describe('generateWeeklyInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleEntries: MoodEntry[] = [
    { date: '2025-04-07', score: 6, label: 'neutral', trigger: 'work emails', recordedAt: 1 },
    { date: '2025-04-08', score: 8, label: 'calm', trigger: 'meditation', recordedAt: 2 },
    { date: '2025-04-09', score: 4, label: 'stressed', trigger: 'project deadline', recordedAt: 3 },
    { date: '2025-04-10', score: 9, label: 'joyful', trigger: 'hiking', recordedAt: 4 },
    { date: '2025-04-11', score: 7, label: 'content', trigger: 'family dinner', recordedAt: 5 },
  ]

  it('returns Gemini insight text on success', async () => {
    mockGeminiOk('You balanced stress and joy beautifully this week.')

    const result = await generateWeeklyInsight(sampleEntries, 'fake-key')

    expect(result).toBe('You balanced stress and joy beautifully this week.')
  })

  it('returns fallback when Gemini throws', async () => {
    mockGeminiError()

    const result = await generateWeeklyInsight(sampleEntries, 'fake-key')

    expect(result).toContain("week of ups and downs")
  })

  it('returns fallback on non-ok status', async () => {
    mockGeminiBadStatus()

    const result = await generateWeeklyInsight(sampleEntries, 'fake-key')

    expect(result).toContain("week of ups and downs")
  })

  it('returns fallback when Gemini returns empty text', async () => {
    vi.mocked(geminiGenerate).mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '' }] } }] }),
    } as unknown as Response)

    const result = await generateWeeklyInsight(sampleEntries, 'fake-key')

    expect(result).toContain("week of ups and downs")
  })
})
