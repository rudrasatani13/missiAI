export type SleepSessionMode = 'personalized_story' | 'custom_story' | 'breathing' | 'library'

export type BreathingTechnique = '4-7-8' | 'box' | 'belly'

export type LibraryStoryCategory = 'nature' | 'space' | 'ocean' | 'childhood' | 'adventure' | 'meditation'

export interface SleepStory {
  /** Unique identifier — nanoid(10) for AI-generated, fixed IDs for library */
  id: string
  /** Mode that created this story */
  mode: SleepSessionMode
  /** Short title (max 60 chars) */
  title: string
  /** The full story text — sanitized, ready for TTS (max 6000 chars) */
  text: string
  /** Estimated listening duration in seconds (computed from text length) */
  estimatedDurationSec: number
  /** For library mode: category */
  category?: LibraryStoryCategory
  /** For personalized mode: what context seeded this story */
  contextSummary?: string
  /** Unix ms when generated */
  generatedAt: number
}

export interface BreathingSession {
  technique: BreathingTechnique
  /** Number of breath cycles */
  cycles: number
  /** Estimated duration in seconds */
  estimatedDurationSec: number
  /** The narration script (sanitized, ready for TTS) */
  script: string
}

export interface SleepSessionHistoryEntry {
  id: string
  date: string  // ISO timestamp
  mode: SleepSessionMode
  title: string
  completed: boolean
  durationSec: number
}

export interface SleepSession {
  id: string
  [key: string]: any
}
