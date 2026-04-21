import { MemoryCategory } from './memory'

export interface LifeChapter {
  id: string
  title: string
  description: string
  startDate: number
  endDate?: number
  nodeIds: string[]
  dominantCategory: MemoryCategory
  emotionalTone: 'joyful' | 'growth' | 'challenging' | 'reflective' | 'neutral'
  coverEmoji: string
  generatedAt: number
}

export interface TimelineEvent {
  nodeId: string
  timestamp: number
  title: string
  category: MemoryCategory
  emotionalWeight: number
  chapterId: string | null
}

export interface TopCategoryCount {
  category: MemoryCategory
  count: number
}

export interface YearInReview {
  year: number
  userId: string
  totalMemories: number
  topCategories: TopCategoryCount[]
  topPeople: string[]
  emotionalArc: number[]
  keyMoments: string[]
  narrative: string
  highlights: string[]
  generatedAt: number
}

export interface ConstellationCluster {
  label: string
  nodeIds: string[]
  centerX: number
  centerY: number
}

export interface ConstellationGrouping {
  mode: 'by_category' | 'by_time' | 'by_emotion' | 'by_people'
  clusters: ConstellationCluster[]
}
