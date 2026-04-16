// @ts-ignore
import { nanoid } from 'nanoid'
import type { SleepStory } from '@/types/sleep-sessions'
import { geminiGenerate } from '@/lib/ai/vertex-client'
import { getRandomFallbackStory } from '@/lib/sleep-sessions/library-stories'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'

const GEMINI_MODEL = 'gemini-2.5-pro'
const TIMEOUT_MS = 12000

export interface UserContext {
  moodLabel?: string
  moodScore?: number
  recentFocus: string[]
  firstName: string
  stressfulDay: boolean
}

export function sanitizeStoryText(raw: string): string {
  let result = raw

  // 1. Strip HTML tags
  result = result.replace(/<[^>]+>/g, '')

  // 2. Strip SSML tags specifically
  result = result.replace(/<speak>|<voice[^>]*>|<prosody[^>]*>|<\/speak>|<\/voice>|<\/prosody>/gi, '')

  // 3. Strip control characters (except newline, tab, and space)
  // \x09 is tab, \x0A is newline, \x0D is carriage return
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // 4. Strip URLs
  result = result.replace(/(https?:\/\/|www\.)[^\s]+/gi, '')

  // 5. Strip email addresses
  result = result.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gi, '')

  // 6. Strip phone number patterns
  result = result.replace(/(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '')

  // 7. Strip prompt injection patterns
  result = sanitizeMemories(result)

  // 8. Normalize whitespace (collapse spaces/newlines, but preserve paragraph breaks moderately)
  result = result.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  // 9. Trim to max 6000 chars
  if (result.length > 6000) {
    result = result.slice(0, 6000)
    // Try to break at last period if possible to not end mid-sentence
    const lastPeriod = result.lastIndexOf('.')
    if (lastPeriod > 0) {
        result = result.slice(0, lastPeriod + 1)
    }
  }

  return result
}

export async function generatePersonalizedStory(
  userContext: UserContext,
  geminiApiKey: string
): Promise<SleepStory> {
  const systemPrompt = `You are Missi's sleep story narrator. Generate a warm, slow-paced bedtime story that helps the user drift into sleep.
REQUIREMENTS:
* Length: 600-900 words (approximately 4-6 minutes when read slowly)
* Pace: slow, gentle, use short sentences
* Content: peaceful imagery, sensory details (sounds, textures, gentle movement), no tension or conflict
* Tone: soothing, maternal warmth, no excitement
* NO: sudden events, loud sounds, action, questions to the user, mentions of technology, dates, times
* AVOID: mentioning the user's name more than twice, mentioning specific stressful topics from their context
* Close with a gentle sleep-inducing ending like "...and slowly, you drift into peaceful sleep."
If the user had a stressful day (mood score below 5), emphasize safety and warmth. If they had a good day, emphasize gentle continuation.
Respond with ONLY the story text. No title, no introduction, no formatting. Just the story.

// USER CONTEXT
Mood: ${userContext.moodLabel || 'Unknown'} (${userContext.moodScore != null ? userContext.moodScore + '/10' : 'Unknown'})
Recent life focus: ${userContext.recentFocus.join(', ').slice(0, 150)}
First name: ${userContext.firstName || 'friend'}
// END USER CONTEXT`

  return callGeminiAndParse(systemPrompt, geminiApiKey, 'personalized_story', 'Tonight\'s Story')
}

export async function generateCustomStory(
  userPrompt: string,
  geminiApiKey: string
): Promise<SleepStory> {
  if (typeof userPrompt !== 'string' || userPrompt.length < 3 || userPrompt.length > 200) {
    throw new Error("Invalid prompt length")
  }

  // Sanitize the prompt slightly just in case
  const safePrompt = userPrompt.replace(/[\n\r]/g, ' ').slice(0, 200)

  const systemPrompt = `The user has requested a story about: ${safePrompt}
Generate a peaceful bedtime story around this theme. Keep all the same rules about pacing, length, and tone.
REQUIREMENTS:
* Length: 600-900 words
* Pace: slow, gentle, use short sentences
* Content: peaceful imagery, sensory details, no tension or conflict
* Tone: soothing, maternal warmth
* NO: sudden events, loud sounds, action, questions to the user, mentions of technology
* Close with a gentle sleep-inducing ending like "...and slowly, you drift into peaceful sleep."
Respond with ONLY the story text. No title, no introduction, no formatting. Just the story.`

  return callGeminiAndParse(systemPrompt, geminiApiKey, 'custom_story', `A story about ${safePrompt.slice(0, 30)}...`)
}

async function callGeminiAndParse(
  systemPrompt: string,
  geminiApiKey: string,
  mode: SleepStory['mode'],
  defaultTitle: string
): Promise<SleepStory> {
  if (!geminiApiKey) {
    return getRandomFallbackStory()
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let rawText = ''
  let success = false

  try {
    const res = await geminiGenerate(
      GEMINI_MODEL,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: "Write the story." }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      },
      { signal: controller.signal }
    )

    if (res.ok) {
      const data = await res.json()
      rawText = data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text as string)
        .join('') ?? ''
      if (rawText.length > 0) success = true
    }
  } catch (err) {
    // We catch timeouts and return fallback
  } finally {
    clearTimeout(timer)
  }

  if (!success || rawText.trim().length === 0) {
    return getRandomFallbackStory()
  }

  const cleanText = sanitizeStoryText(rawText)

  // Discard and fallback if sanitization stripped > 30%
  if (cleanText.length < rawText.length * 0.7) {
    return getRandomFallbackStory()
  }

  let title = defaultTitle
  const sentences = cleanText.split('.')
  if (sentences.length > 0 && sentences[0].length > 10 && sentences[0].length <= 60) {
      title = sentences[0].trim()
  }

  const wordCount = cleanText.split(/\s+/).filter(Boolean).length
  const estimatedDurationSec = Math.ceil((wordCount / 130) * 60)

  return {
    id: nanoid(10),
    mode,
    title,
    text: cleanText,
    estimatedDurationSec,
    generatedAt: Date.now(),
  }
}
