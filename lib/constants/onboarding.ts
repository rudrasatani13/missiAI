export interface TourStep {
  title: string
  text: string
  hint?: string
  /** CSS selector of the element to highlight. Card appears next to it. */
  targetSelector: string | null
  /** Which side of the target to place the card */
  cardPlacement: 'below' | 'right' | 'above' | 'center'
}

export const STEPS: TourStep[] = [
  {
    title: 'Talk to Missi',
    text: 'Tap anywhere on the screen to start talking. Tap again when you\'re done. Missi listens, thinks, and speaks back.',
    hint: 'Space to talk on desktop',
    targetSelector: '[data-testid="voice-button"]',
    cardPlacement: 'above',
  },
  {
    title: 'Customize',
    text: 'Change Missi\'s personality, voice, and language from Settings.',
    targetSelector: '[data-testid="sidebar-settings-btn"]',
    cardPlacement: 'above',
  },
  {
    title: 'Memory',
    text: 'Missi remembers your conversations automatically. Your life graph builds over time — the more you talk, the better Missi knows you.',
    targetSelector: '[data-testid="sidebar-memory-btn"]',
    cardPlacement: 'right',
  },
  {
    title: 'Streaks & Avatar',
    text: 'Build daily habits, earn XP from every conversation, and watch your avatar evolve from Spark to Cosmic.',
    targetSelector: '[data-testid="sidebar-streaks-btn"]',
    cardPlacement: 'right',
  },
  {
    title: 'You\'re all set',
    text: 'Start by saying hi. Missi is always here for you.',
    targetSelector: '[data-testid="voice-button"]',
    cardPlacement: 'above',
  },
]
