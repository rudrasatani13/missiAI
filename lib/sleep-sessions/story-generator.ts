import { nanoid } from 'nanoid'
import type { SleepStory } from '@/types/sleep-sessions'
import { geminiGenerate } from '@/lib/ai/providers/vertex-client'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'

const GEMINI_MODEL = 'gemini-2.5-pro'
const TIMEOUT_MS = 45000
const GENERATED_SLEEP_STORY_WPM = 105
export const MAX_SLEEP_STORY_CHARS = 16000

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
  if (result.length > MAX_SLEEP_STORY_CHARS) {
    result = result.slice(0, MAX_SLEEP_STORY_CHARS)
    // Try to break at last period if possible to not end mid-sentence
    const lastPeriod = result.lastIndexOf('.')
    if (lastPeriod > 0) {
        result = result.slice(0, lastPeriod + 1)
    }
  }

  return result
}

function createSleepStory(mode: SleepStory['mode'], defaultTitle: string, cleanText: string): SleepStory {
  let title = defaultTitle
  const sentences = cleanText.split('.')
  if (sentences.length > 0 && sentences[0].length > 10 && sentences[0].length <= 60) {
      title = sentences[0].trim()
  }

  const wordCount = cleanText.split(/\s+/).filter(Boolean).length
  const estimatedDurationSec = Math.ceil((wordCount / GENERATED_SLEEP_STORY_WPM) * 60)

  return {
    id: nanoid(10),
    mode,
    title,
    text: cleanText,
    estimatedDurationSec,
    generatedAt: Date.now(),
  }
}

function buildPersonalizedFallbackStory(userContext: UserContext): SleepStory {
  const focusSummary = userContext.recentFocus.filter(Boolean).slice(0, 2).join(' and ').toLowerCase() || 'the gentle parts of the day'
  const cleanText = sanitizeStoryText(
    userContext.stressfulDay
      ? `The day had asked enough of you, so the night arrived softly, like a warm blanket settling over tired shoulders. In a quiet world shaped by ${focusSummary}, small lamps glowed along a slow path, and every step felt lighter than the one before it. A mild breeze moved through the trees without urgency. Far away, a stream made a low and steady sound, as if it had all the time in the world. You followed the path to a little resting place with a wooden chair, a folded blanket, and a window open to cool evening air. Nothing was expected of you there. Nothing needed solving. The world simply held you in a calm and patient silence. As the night deepened, the lamps became softer, the breeze gentler, and even your thoughts seemed to rest one by one. The chair became warmer, the blanket lighter, and the quiet around you felt safe and kind. Above you, the sky stretched wide and dark and peaceful, and below you, the earth felt steady and still. You stayed there for a long, unhurried while, breathing slowly, letting the day drift farther away, until the soft night carried you toward stillness, and slowly, you drifted into peaceful sleep.`
      : `Evening arrived slowly and kindly, like warm light settling across a quiet room. Somewhere beyond the busy edges of the day, there was a peaceful place shaped by ${focusSummary}, where the air was cool, the paths were calm, and everything moved at a gentle pace. Small lanterns glowed beside a garden path, and pale leaves shimmered softly whenever the breeze passed through. Nearby, water moved in a steady ribbon, making a hush that never asked for attention and never faded. You wandered there without hurry, noticing the simple comfort of each step, the softness of the air, and the way the whole place seemed to breathe with you. In the center of the garden stood a little bench beneath a tree with wide patient branches. You rested there and listened to the quiet. The lanterns dimmed to a tender glow. The sky grew darker and softer. The branches swayed once, then settled. Everything in that peaceful place seemed to know how to let go of the day. You stayed in that calm garden for a long, easy while, wrapped in stillness, warmth, and the gentle feeling that the night was carrying you somewhere safe. And in that slow and quiet peace, your breathing eased, your thoughts softened, and slowly, you drifted into peaceful sleep.`
  )

  return createSleepStory('personalized_story', "Tonight's Story", cleanText)
}

function buildCustomFallbackStory(userPrompt: string): SleepStory {
  const topic = userPrompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'a gentle dream'
  const cleanText = sanitizeStoryText(
    `In a hush of silver starlight and patient footsteps, an original bedtime tale began, carrying the gentle feeling of ${topic}. The world was quiet there, shaped by soft hills, lantern-lit paths, and the calm sense that the night itself was guiding every step. Nothing rushed. Nothing startled the air. There were only long peaceful roads, warm windows glowing in the distance, and a sky so wide and still that every breath seemed to become slower beneath it. As the journey continued, the path curved through sleeping gardens and over low green ridges where the wind moved like a whisper through the grass. The distant trees stood dark and kind against the horizon. A stream slipped over smooth stones with a slow, drowsy murmur. Every sound belonged to rest. Every light grew softer as the night deepened. In time, the road led to a small shelter with a wooden porch, a waiting blanket, and a lantern burning with the faintest golden light. You could sit there and look out over the quiet land for as long as you liked, listening to the steady stream, feeling the cool night air, and letting the long gentle journey grow lighter and lighter inside you. The lantern dimmed. The hills softened into shadow. The path behind you disappeared into peace. And with the calm feeling of ${topic} settling around you like a dream, your thoughts became still, your breathing became slow, and slowly, you drifted into peaceful sleep.`
  )

  return createSleepStory('custom_story', `A story about ${topic.slice(0, 30)}...`, cleanText)
}

function isLikelyRefusal(text: string): boolean {
  const opening = text.trim().toLowerCase().slice(0, 240)
  return [
    /^sorry\b/,
    /^i can(?:not|'t)\b/,
    /^i am unable\b/,
    /^i won't\b/,
    /^i cannot\b/,
    /cannot provide/,
    /can't provide/,
    /copyright/,
    /instead,? i can/,
  ].some((pattern) => pattern.test(opening))
}

export async function generatePersonalizedStory(
  userContext: UserContext
): Promise<SleepStory> {
  const fallbackStory = buildPersonalizedFallbackStory(userContext)
  const systemPrompt = `You are Missi's sleep story narrator. Generate a warm, slow-paced bedtime story that helps the user drift into sleep.
REQUIREMENTS:
* Length: 1200-2200 words (approximately 10-20 minutes when read slowly)
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

  return callGeminiAndParse(systemPrompt, 'personalized_story', 'Tonight\'s Story', fallbackStory)
}

export async function generateCustomStory(
  userPrompt: string
): Promise<SleepStory> {
  if (typeof userPrompt !== 'string' || userPrompt.length < 3 || userPrompt.length > 200) {
    throw new Error("Invalid prompt length")
  }

  // Sanitize the prompt slightly just in case
  const safePrompt = userPrompt.replace(/[\n\r]/g, ' ').slice(0, 200)
  const fallbackStory = buildCustomFallbackStory(safePrompt)

  const systemPrompt = `The user has requested a story about: ${safePrompt}
Create an original, sleep-safe bedtime story that clearly reflects this theme.
If the theme references an existing book, film, show, game, character, or copyrighted world, do not retell or quote the original material. Instead, write a fresh original bedtime story that captures the atmosphere, imagery, and emotional feeling the user wants while staying distinct.
REQUIREMENTS:
* Length: 1200-2200 words (approximately 10-20 minutes when read slowly)
* Pace: slow, gentle, use short sentences
* Content: peaceful imagery, sensory details, no tension or conflict
* Tone: soothing, maternal warmth
* NO: sudden events, loud sounds, action, questions to the user, mentions of technology
* Close with a gentle sleep-inducing ending like "...and slowly, you drift into peaceful sleep."
Respond with ONLY the story text. No title, no introduction, no formatting. Just the story.`

  return callGeminiAndParse(systemPrompt, 'custom_story', `A story about ${safePrompt.slice(0, 30)}...`, fallbackStory)
}

async function callGeminiAndParse(
  systemPrompt: string,
  mode: SleepStory['mode'],
  defaultTitle: string,
  fallbackStory: SleepStory,
): Promise<SleepStory> {

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
          maxOutputTokens: 4096,
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
  } catch {
    // We catch timeouts and return fallback
  } finally {
    clearTimeout(timer)
  }

  if (!success || rawText.trim().length === 0 || isLikelyRefusal(rawText)) {
    return fallbackStory
  }

  const cleanText = sanitizeStoryText(rawText)

  // Discard and fallback if sanitization stripped > 30%
  if (cleanText.length < rawText.length * 0.7 || cleanText.trim().length === 0 || isLikelyRefusal(cleanText)) {
    return fallbackStory
  }

  return createSleepStory(mode, defaultTitle, cleanText)
}
