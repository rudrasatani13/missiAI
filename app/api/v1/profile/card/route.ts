import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { clerkClient } from '@clerk/nextjs/server'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { getGamificationData } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import { geminiGenerate } from '@/lib/ai/vertex-client'
import { AVATAR_TIERS, getAvatarTierInfo } from '@/types/gamification'
import { logRequest, logError } from '@/lib/server/logger'
import type { KVStore } from '@/types'
import type { LifeNode } from '@/types/memory'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// ─── Profile Card Data Shape ─────────────────────────────────────────────────

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

// ─── Deduplication Helpers ───────────────────────────────────────────────────

/**
 * Compute word overlap ratio between two strings.
 * Returns 0-1 (1 = identical words).
 */
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

/**
 * Remove semantically similar strings based on word overlap.
 * Keeps the first occurrence (highest priority).
 */
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

/**
 * Patterns that indicate behavioral observations rather than genuine interests.
 * These should be filtered out from "What I Love".
 */
const BEHAVIORAL_PATTERNS = [
  /^uses?\s/i,                    // "Uses formal honorifics..."
  /\bcommunicat/i,                // "Communicates in..."
  /\bproficient\s+in\b/i,        // "Proficient in Hindi"
  /\bprefers?\s+to\s/i,          // "Prefers to speak..."
  /\blanguage\b/i,               // anything about language
  /\bstyle\b/i,                  // communication style
  /\bhinglish\b/i,               // specific language refs
  /\bformal\b.*\bhonorific/i,    // honorifics
  /\binformal\b/i,               // informal speech patterns
  /\bspeaks?\s/i,                // "Speaks Hindi"
  /\brespond/i,                  // "Responds in..."
  /\bconversat/i,                // "Conversational..."
  /\bgreet/i,                    // "Greets with..."
  /\baddress/i,                  // "Addresses people..."
  /\btrack/i,                    // "Tracks habits..."
  /\bshow\s+respect/i,           // behavior patterns
]

/**
 * Check if a node represents a genuine interest/preference vs behavioral observation.
 */
function isGenuineInterest(node: LifeNode): boolean {
  const text = node.title
  // Reject if it matches any behavioral pattern
  for (const pattern of BEHAVIORAL_PATTERNS) {
    if (pattern.test(text)) return false
  }
  // Too long titles are usually observations, not interests
  if (text.length > 60) return false
  return true
}

/**
 * Extract a clean person name from a relationship/person node title.
 * Returns null if the title is about the user themselves or AI.
 */
function extractPersonName(title: string, userName: string): string | null {
  const lower = title.toLowerCase().trim()

  // Skip AI assistant references
  if (lower.includes('ai assistant') || lower.includes('ai companion') ||
      lower.includes('missi') || lower.includes('chatbot') || lower.includes('assistant')) {
    return null
  }

  // Skip self-references
  const userLower = userName.toLowerCase()
  if (lower === userLower || lower === 'user' || lower === "user's name") {
    return null
  }

  // If the title is a simple name (1-3 words, no relationship verbs), return as-is
  const words = title.trim().split(/\s+/)
  if (words.length <= 3 && !lower.includes('friend') && !lower.includes('rapport') &&
      !lower.includes('relationship') && !lower.includes('close') && !lower.includes('best')) {
    return title.trim()
  }

  // Try to extract person name from relationship descriptions
  // Patterns: "Best friends with X", "X is Y's best friend", "Close to X", "Married to X"
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
      // Validate it's actually a name (not too long, no common words)
      if (name.length > 0 && name.length < 30 && name.split(/\s+/).length <= 4) {
        // Skip if the extracted name is the user or AI
        const nameLower = name.toLowerCase()
        if (nameLower === userLower || nameLower.includes('ai') || nameLower.includes('assistant')) {
          return null
        }
        return name
      }
    }
  }

  // If it contains the user's name, it's about the user's relationship — skip
  if (lower.includes(userLower) && lower !== userLower) {
    // Extract the other person's name
    const cleaned = title.replace(new RegExp(userName, 'gi'), '').trim()
    const relWords = cleaned.replace(/\b(is|and|with|the|a|an|best|close|friend|friends|rapport)\b/gi, '').trim()
    if (relWords.length > 0 && relWords.length < 30) return relWords
    return null
  }

  // Fallback: return the title if short enough to be a name
  if (title.length < 25) return title.trim()

  return null
}

// ─── Personality Snapshot via Gemini ──────────────────────────────────────────

const FALLBACK_SNAPSHOT = "A curious, growth-minded person building something meaningful."

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

// ─── GET — generate profile card data ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('profile.card.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse({ success: false, error: 'Failed to load profile data' }, 500)
  }

  // Award daily login XP (fire-and-forget) — triggers loginStreak update
  const loginCooldownKey = `xp-cooldown:login:${userId}`
  kv.get(loginCooldownKey).then(existing => {
    if (!existing) {
      awardXP(kv!, userId, 'login').catch(() => {})
      kv!.put(loginCooldownKey, '1', { expirationTtl: 86400 }).catch(() => {})
    }
  }).catch(() => {})

  // Check for cached result (unless refresh=true)
  const refresh = req.nextUrl.searchParams.get('refresh') === 'true'
  const cacheKey = `profile:card:${userId}`

  if (!refresh) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        logRequest('profile.card.cache_hit', userId, startTime)
        return jsonResponse({ success: true, data: JSON.parse(cached) })
      }
    } catch {
      // Cache miss or parse error — continue to generate
    }
  }

  try {
    // Load data in parallel
    const [graph, gamification] = await Promise.all([
      getLifeGraph(kv, userId),
      getGamificationData(kv, userId),
    ])

    // Get user name from Clerk
    let userName = 'User'
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      userName = user.firstName || user.username || 'User'
    } catch {
      // Fallback to default
    }

    // ── Top Interests (What I Love) ───────────────────────────────────────
    // Only show genuine interests/preferences, not behavioral observations.
    // Deduplicate semantically similar items.
    const interestNodes = graph.nodes
      .filter(n => (n.category === 'preference' || n.category === 'skill') && isGenuineInterest(n))
      .sort((a, b) => {
        // Prioritize high emotional weight, then access count
        const emotionDiff = b.emotionalWeight - a.emotionalWeight
        if (Math.abs(emotionDiff) > 0.1) return emotionDiff
        return b.accessCount - a.accessCount
      })

    const rawInterests = interestNodes.slice(0, 8).map(n => n.title)
    const topInterests = deduplicateStrings(rawInterests, 0.4).slice(0, 5)

    // ── People in My World ─────────────────────────────────────────────────
    // Extract unique person names, remove AI refs and self-refs.
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

      // Exact match check
      if (seenNames.has(nameLower)) continue

      // Check if nameLower is a substring of an already seen name in O(1)
      let isDup = seenSubstrings.has(nameLower)

      // Check if any existing name is a substring of nameLower in O(L^2) where L is string length, avoiding O(N) loop over seenNames
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

      // Pre-compute all substrings of nameLower and add to seenSubstrings for O(1) lookups
      for (let j = 0; j < nameLower.length; j++) {
        for (let k = j + 1; k <= nameLower.length; k++) {
          seenSubstrings.add(nameLower.slice(j, k))
        }
      }

      peopleInMyWorld.push(name)
    }

    // ── Active Goals ───────────────────────────────────────────────────────
    // Show genuinely distinct goals, deduplicate overlapping ones.
    let goalNodes = graph.nodes
      .filter(n => n.category === 'goal')
      .sort((a, b) => {
        // Prefer higher confidence and more recently updated
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

    // ── Top Habit ──────────────────────────────────────────────────────────
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

    // ── Personality Snapshot (fire-and-forget safe) ─────────────────────────
    const topEmotionalNodes = [...graph.nodes]
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 5)

    const personalitySnapshot = await generatePersonalitySnapshot(topEmotionalNodes)

    // ── Memory Stats ───────────────────────────────────────────────────────
    const tagCounts = new Map<string, number>()
    for (const node of graph.nodes) {
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
    let mostTalkedAbout = 'Nothing yet'
    let maxTagCount = 0
    for (const [tag, count] of tagCounts) {
      if (count > maxTagCount) {
        maxTagCount = count
        mostTalkedAbout = tag
      }
    }

    let daysActive = 0
    if (graph.nodes.length > 0) {
      // PERF (C2): Use reduce instead of Math.min(...spread) to avoid
      // stack overflow with large node counts (>10,000 nodes).
      const oldestCreatedAt = graph.nodes.reduce(
        (min, n) => Math.min(min, n.createdAt), Infinity
      )
      const lastUpdated = graph.lastUpdatedAt || Date.now()
      daysActive = Math.max(1, Math.ceil((lastUpdated - oldestCreatedAt) / (1000 * 60 * 60 * 24)))
    }

    // ── Avatar Info ────────────────────────────────────────────────────────
    const tierInfo = getAvatarTierInfo(gamification.avatarTier)

    // ── Unlocked Achievements ──────────────────────────────────────────────
    const unlockedAchievements = gamification.achievements.filter(a => a.unlockedAt !== null).length

    // ── Build response ─────────────────────────────────────────────────────
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

    // Cache for 1 hour
    try {
      await kv.put(cacheKey, JSON.stringify(cardData), { expirationTtl: 3600 })
    } catch {
      // Cache write failed — non-critical
    }

    logRequest('profile.card.generated', userId, startTime)
    return jsonResponse({ success: true, data: cardData })
  } catch (err) {
    logError('profile.card.error', err, userId)
    return jsonResponse({ success: false, error: 'Failed to load profile data' }, 500)
  }
}
