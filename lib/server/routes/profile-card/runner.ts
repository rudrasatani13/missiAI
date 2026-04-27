import type { NextRequest } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { getLifeGraphReadSnapshot } from '@/lib/memory/life-graph'
import { getGamificationData } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import { geminiGenerate } from '@/lib/ai/providers/vertex-client'
import { AVATAR_TIERS } from '@/types/gamification'
import { logRequest, logError } from '@/lib/server/observability/logger'
import { waitUntil } from '@/lib/server/platform/wait-until'
import type { KVStore } from '@/types'
import type { LifeNode } from '@/types/memory'
import {
  getProfileCardCacheKey,
  profileCardJsonResponse,
  requireProfileCardKV,
  shouldRefreshProfileCard,
} from '@/lib/server/routes/profile-card/helpers'

interface ProfileCardData {
  userName: string
  avatarTier: string
  level: number
  totalXP: number
  loginStreak: number
  topInterests: string[]
  peopleInMyWorld: string[]
  activeGoals: string[]
  topHabit: { title: string; currentStreak: number; longestStreak: number } | null
  personalitySnapshot: string
  memoryStats: {
    totalMemories: number
    mostTalkedAbout: string
    daysActive: number
    totalInteractions: number
  }
  unlockedAchievements: number
  generatedAt: string
}

const PROFILE_CARD_GRAPH_READ_OPTIONS = { limit: 250, newestFirst: true } as const

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.min(wordsA.size, wordsB.size)
}

function deduplicateStrings(items: string[], threshold = 0.5): string[] {
  const result: string[] = []
  for (const item of items) {
    const isDuplicate = result.some(existing => wordOverlap(existing, item) >= threshold)
    if (!isDuplicate) {
      result.push(item)
    }
  }
  return result
}

const BEHAVIORAL_PATTERNS = [
  /^uses?\s/i,
  /\bcommunicat/i,
  /\bproficient\s+in\b/i,
  /\bprefers?\s+to\s/i,
  /\blanguage\b/i,
  /\bstyle\b/i,
  /\bhinglish\b/i,
  /\bformal\b.*\bhonorific/i,
  /\binformal\b/i,
  /\bspeaks?\s/i,
  /\brespond/i,
  /\bconversat/i,
  /\bgreet/i,
  /\baddress/i,
  /\btrack/i,
  /\bshow\s+respect/i,
]

function isGenuineInterest(node: LifeNode): boolean {
  const text = node.title
  for (const pattern of BEHAVIORAL_PATTERNS) {
    if (pattern.test(text)) return false
  }
  if (text.length > 60) return false
  return true
}

function extractPersonName(title: string, userName: string): string | null {
  const lower = title.toLowerCase().trim()

  if (lower.includes('ai assistant') || lower.includes('ai companion') ||
      lower.includes('missi') || lower.includes('chatbot') || lower.includes('assistant')) {
    return null
  }

  const userLower = userName.toLowerCase()
  if (lower === userLower || lower === 'user' || lower === "user's name") {
    return null
  }

  const words = title.trim().split(/\s+/)
  if (words.length <= 3 && !lower.includes('friend') && !lower.includes('rapport') &&
      !lower.includes('relationship') && !lower.includes('close') && !lower.includes('best')) {
    return title.trim()
  }

  const namePatterns = [
    /(?:best\s+)?friends?\s+with\s+(.+)/i,
    /(.+?)\s+is\s+.+(?:friend|partner|spouse|sibling)/i,
    /close\s+(?:to|with|rapport\s+with)\s+(.+)/i,
    /married\s+to\s+(.+)/i,
    /(?:loves?|cares?\s+about|adores?)\s+(.+)/i,
    /(.+?)'s\s+(?:best\s+)?friend/i,
  ]

  for (const pattern of namePatterns) {
    const match = title.match(pattern)
    if (match?.[1]) {
      const name = match[1].trim().replace(/[.,!?]+$/, '')
      if (name.length > 0 && name.length < 30 && name.split(/\s+/).length <= 4) {
        const nameLower = name.toLowerCase()
        if (nameLower === userLower || nameLower.includes('ai') || nameLower.includes('assistant')) {
          return null
        }
        return name
      }
    }
  }

  if (lower.includes(userLower) && lower !== userLower) {
    const cleaned = title.replace(new RegExp(userName, 'gi'), '').trim()
    const relWords = cleaned.replace(/\b(is|and|with|the|a|an|best|close|friend|friends|rapport)\b/gi, '').trim()
    if (relWords.length > 0 && relWords.length < 30) return relWords
    return null
  }

  if (title.length < 25) return title.trim()

  return null
}

const FALLBACK_SNAPSHOT = 'A curious, growth-minded person building something meaningful.'

async function generatePersonalitySnapshot(topNodes: LifeNode[]): Promise<string> {
  if (topNodes.length === 0) return FALLBACK_SNAPSHOT

  const facts = topNodes.map(n => n.detail).join(', ')
  const prompt = `Based on these facts about a person, write exactly one sentence (max 15 words) describing their personality. Be specific, warm, and insightful. Facts: ${facts}. Respond with only the sentence, no quotes.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await Promise.race([
      geminiGenerate('gemini-2.0-flash', {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.7 },
      }, { signal: controller.signal }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 3000)
      ),
    ])

    clearTimeout(timeout)

    if (!response.ok) return FALLBACK_SNAPSHOT

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text && text.length > 5 && text.length < 200 ? text : FALLBACK_SNAPSHOT
  } catch {
    clearTimeout(timeout)
    return FALLBACK_SNAPSHOT
  }
}

function scheduleLoginXp(kv: KVStore, userId: string) {
  const loginCooldownKey = `xp-cooldown:login:${userId}`
  waitUntil(
    kv.get(loginCooldownKey).then(existing => {
      if (!existing) {
        awardXP(kv, userId, 'login').catch(() => {})
        kv.put(loginCooldownKey, '1', { expirationTtl: 86400 }).catch(() => {})
      }
    }).catch(() => {}),
  )
}

export async function runProfileCardGetRoute(req: NextRequest, userId: string): Promise<Response> {
  const startTime = Date.now()
  const kvResult = requireProfileCardKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  const { kv } = kvResult
  scheduleLoginXp(kv, userId)

  const refresh = shouldRefreshProfileCard(req)
  const cacheKey = getProfileCardCacheKey(userId)

  if (!refresh) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        logRequest('profile.card.cache_hit', userId, startTime)
        return profileCardJsonResponse({ success: true, data: JSON.parse(cached) })
      }
    } catch {
    }
  }

  try {
    const [graph, gamification] = await Promise.all([
      getLifeGraphReadSnapshot(kv, userId, PROFILE_CARD_GRAPH_READ_OPTIONS),
      getGamificationData(kv, userId),
    ])

    let userName = 'User'
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      userName = user.firstName || user.username || 'User'
    } catch {
    }

    const interestNodes = graph.nodes
      .filter(n => (n.category === 'preference' || n.category === 'skill') && isGenuineInterest(n))
      .sort((a, b) => {
        const emotionDiff = b.emotionalWeight - a.emotionalWeight
        if (Math.abs(emotionDiff) > 0.1) return emotionDiff
        return b.accessCount - a.accessCount
      })

    const rawInterests = interestNodes.slice(0, 8).map(n => n.title)
    const topInterests = deduplicateStrings(rawInterests, 0.4).slice(0, 5)

    const peopleNodes = graph.nodes
      .filter(n => n.category === 'person' || n.category === 'relationship')
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)

    const seenNames = new Set<string>()
    const seenSubstrings = new Set<string>()
    const peopleInMyWorld: string[] = []
    for (const node of peopleNodes) {
      if (peopleInMyWorld.length >= 4) break
      const name = extractPersonName(node.title, userName)
      if (!name) continue
      const nameLower = name.toLowerCase()

      if (seenNames.has(nameLower)) continue

      let isDup = seenSubstrings.has(nameLower)

      if (!isDup) {
        for (let j = 0; j < nameLower.length; j++) {
          for (let k = j + 1; k <= nameLower.length; k++) {
            if (seenNames.has(nameLower.slice(j, k))) {
              isDup = true
              break
            }
          }
          if (isDup) break
        }
      }

      if (isDup) continue

      seenNames.add(nameLower)

      for (let j = 0; j < nameLower.length; j++) {
        for (let k = j + 1; k <= nameLower.length; k++) {
          seenSubstrings.add(nameLower.slice(j, k))
        }
      }

      peopleInMyWorld.push(name)
    }

    let goalNodes = graph.nodes
      .filter(n => n.category === 'goal')
      .sort((a, b) => {
        const confDiff = b.confidence - a.confidence
        if (Math.abs(confDiff) > 0.1) return confDiff
        return b.updatedAt - a.updatedAt
      })

    if (goalNodes.length === 0) {
      goalNodes = graph.nodes
        .filter(n => n.tags.some(t => t.toLowerCase() === 'goal'))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    }

    const rawGoals = goalNodes.slice(0, 6).map(n => n.title)
    const activeGoals = deduplicateStrings(rawGoals, 0.35).slice(0, 3)

    let topHabit: ProfileCardData['topHabit'] = null
    if (gamification.habits.length > 0) {
      const best = [...gamification.habits].sort(
        (a, b) => b.longestStreak - a.longestStreak
      )[0]
      topHabit = {
        title: best.title,
        currentStreak: best.currentStreak,
        longestStreak: best.longestStreak,
      }
    }

    const topEmotionalNodes = [...graph.nodes]
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 5)

    const personalitySnapshot = await generatePersonalitySnapshot(topEmotionalNodes)

    let mostTalkedAbout = 'Nothing yet'
    let maxTagCount = 0
    const tagCounts: Record<string, number> = Object.create(null)

    for (let i = 0; i < graph.nodes.length; i++) {
      const tags = graph.nodes[i].tags
      for (let j = 0; j < tags.length; j++) {
        const tag = tags[j]
        const count = (tagCounts[tag] || 0) + 1
        tagCounts[tag] = count

        if (count > maxTagCount) {
          maxTagCount = count
          mostTalkedAbout = tag
        }
      }
    }

    let daysActive = 0
    if (graph.nodes.length > 0) {
      const oldestCreatedAt = graph.nodes.reduce(
        (min, n) => Math.min(min, n.createdAt), Infinity
      )
      const lastUpdated = graph.lastUpdatedAt || Date.now()
      daysActive = Math.max(1, Math.ceil((lastUpdated - oldestCreatedAt) / (1000 * 60 * 60 * 24)))
    }

    const tierInfo = AVATAR_TIERS.find(t => t.tier === gamification.avatarTier) ?? AVATAR_TIERS[0]
    const unlockedAchievements = gamification.achievements.filter(a => a.unlockedAt !== null).length

    const cardData: ProfileCardData = {
      userName,
      avatarTier: tierInfo.name,
      level: gamification.level,
      totalXP: gamification.totalXP,
      loginStreak: gamification.loginStreak,
      topInterests,
      peopleInMyWorld,
      activeGoals,
      topHabit,
      personalitySnapshot,
      memoryStats: {
        totalMemories: graph.nodes.length,
        mostTalkedAbout,
        daysActive,
        totalInteractions: graph.totalInteractions,
      },
      unlockedAchievements,
      generatedAt: new Date().toISOString(),
    }

    try {
      await kv.put(cacheKey, JSON.stringify(cardData), { expirationTtl: 3600 })
    } catch {
    }

    logRequest('profile.card.generated', userId, startTime)
    return profileCardJsonResponse({ success: true, data: cardData })
  } catch (error) {
    logError('profile.card.error', error, userId)
    return profileCardJsonResponse({ success: false, error: 'Failed to load profile data' }, 500)
  }
}
