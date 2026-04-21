import { geminiGenerate } from '@/lib/ai/vertex-client'
import type { MoodEntry, MoodLabel, MoodScore } from '@/types/mood'

const VALID_LABELS = new Set<MoodLabel>([
  'joyful', 'excited', 'calm', 'content', 'neutral',
  'tired', 'anxious', 'stressed', 'sad', 'overwhelmed',
])

const ANALYSIS_SYSTEM_PROMPT = `You are an expert emotional intelligence analyst. Analyze the emotional tone of this conversation and respond with ONLY a valid JSON object — no markdown, no explanation, no code blocks. The JSON must have exactly these fields: { "score": <integer 1-10 where 1=extremely negative, 5=neutral, 10=extremely positive>, "label": <one of: "joyful", "excited", "calm", "content", "neutral", "tired", "anxious", "stressed", "sad", "overwhelmed">, "trigger": <string max 60 chars describing the main topic or context that influenced the mood> } Be specific about the trigger — don't say "general conversation", say what was actually discussed.`

const WEEKLY_INSIGHT_SYSTEM_PROMPT = `You are Missi, a warm and emotionally intelligent AI companion. Based on these mood scores and labels from the past week, write exactly 1-2 sentences of insight that feel personal, specific, and encouraging. Reference the actual days or topics if meaningful. Do not use generic phrases like "overall" or "it seems". Respond with only the insight text — no quotes, no formatting.`

const WEEKLY_INSIGHT_FALLBACK =
  "It's been a week of ups and downs — and that's completely human. Keep talking to me ✨"

function safeDefault(date: string, sessionId?: string): MoodEntry {
  return {
    date,
    score: 5 as MoodScore,
    label: 'neutral' as MoodLabel,
    trigger: 'general conversation',
    recordedAt: Date.now(),
    sessionId,
  }
}

function isValidScore(val: number): val is MoodScore {
  return Number.isInteger(val) && val >= 1 && val <= 10
}

function isValidLabel(val: unknown): val is MoodLabel {
  return typeof val === 'string' && VALID_LABELS.has(val as MoodLabel)
}

// ─── Mood Analysis ────────────────────────────────────────────────────────────

/**
 * Analyzes the emotional tone of a conversation transcript via Gemini.
 * Always returns a valid MoodEntry — never throws.
 */
export async function analyzeMoodFromConversation(
  transcript: string,
  date: string,
  sessionId?: string,
): Promise<MoodEntry> {
  // Trim to last 800 chars to avoid token waste
  const trimmedTranscript = transcript.slice(-800)

  const requestBody = {
    system_instruction: {
      parts: [{ text: ANALYSIS_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: trimmedTranscript }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 200,
    },
  }

  try {
    const res = await geminiGenerate('gemini-2.5-flash', requestBody)
    if (!res.ok) return safeDefault(date, sessionId)

    const json = await res.json()
    const rawText: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Strip markdown code fences if Gemini wraps the JSON anyway
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    const score = Number(parsed.score)
    const label = parsed.label
    const trigger = String(parsed.trigger ?? '').slice(0, 60)

    if (!isValidScore(score) || !isValidLabel(label)) {
      return safeDefault(date, sessionId)
    }

    return {
      date,
      score: score as MoodScore,
      label,
      trigger: trigger || 'general conversation',
      recordedAt: Date.now(),
      sessionId,
    }
  } catch {
    return safeDefault(date, sessionId)
  }
}

// ─── Weekly Insight ───────────────────────────────────────────────────────────

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/**
 * Generates a personalised 1-2 sentence weekly insight from the last 7 mood entries.
 * Uses a 4-second timeout — returns the fallback string if Gemini is too slow.
 * Never throws.
 */
export async function generateWeeklyInsight(
  entries: MoodEntry[],
): Promise<string> {
  const moodSummary = entries
    .map((e) => {
      // Parse YYYY-MM-DD safely; getDay() gives 0=Sun
      const parts = e.date.split('-')
      const d = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
      )
      const dayName = DAY_NAMES[d.getDay()] ?? e.date
      return `${dayName}: ${e.label} (${e.score}/10, trigger: ${e.trigger})`
    })
    .join(', ')

  const requestBody = {
    system_instruction: {
      parts: [{ text: WEEKLY_INSIGHT_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: `Mood data: ${moodSummary}` }],
      },
    ],
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 150,
    },
  }

  try {
    const result = await Promise.race([
      geminiGenerate('gemini-2.5-flash', requestBody).then(async (res) => {
        if (!res.ok) return WEEKLY_INSIGHT_FALLBACK
        const json = await res.json()
        const text: string =
          json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        return text.trim() || WEEKLY_INSIGHT_FALLBACK
      }),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve(WEEKLY_INSIGHT_FALLBACK), 4000),
      ),
    ])
    return result
  } catch {
    return WEEKLY_INSIGHT_FALLBACK
  }
}
