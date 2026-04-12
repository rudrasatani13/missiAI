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
import { geminiGenerate } from '@/lib/ai/vertex-client'
import { AVATAR_TIERS } from '@/types/gamification'
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

    // ── Top Interests ──────────────────────────────────────────────────────
    const interestNodes = graph.nodes
      .filter(n => n.category === 'preference' || n.category === 'skill')
      .sort((a, b) => b.accessCount - a.accessCount)
    const topInterests = interestNodes.slice(0, 5).map(n => n.title)

    // Fill with top tags if fewer than 5
    if (topInterests.length < 5) {
      const allTopNodes = [...graph.nodes].sort((a, b) => b.accessCount - a.accessCount)
      const existingSet = new Set(topInterests.map(t => t.toLowerCase()))
      for (const node of allTopNodes) {
        for (const tag of node.tags) {
          if (!existingSet.has(tag.toLowerCase())) {
            topInterests.push(tag)
            existingSet.add(tag.toLowerCase())
            if (topInterests.length >= 5) break
          }
        }
        if (topInterests.length >= 5) break
      }
    }

    // ── People in My World ─────────────────────────────────────────────────
    const peopleInMyWorld = graph.nodes
      .filter(n => n.category === 'person' || n.category === 'relationship')
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 4)
      .map(n => {
        const title = n.title;
        if (title.toLowerCase() === "user's name" || title.toLowerCase() === 'user') {
          return userName;
        }
        return title.replace(/user's name/ig, userName);
      })

    // ── Active Goals ───────────────────────────────────────────────────────
    let activeGoals = graph.nodes
      .filter(n => n.category === 'goal')
      .slice(0, 3)
      .map(n => n.title)

    if (activeGoals.length === 0) {
      activeGoals = graph.nodes
        .filter(n => n.tags.some(t => t.toLowerCase() === 'goal'))
        .slice(0, 3)
        .map(n => n.title)
    }

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
      const oldestCreatedAt = Math.min(...graph.nodes.map(n => n.createdAt))
      const lastUpdated = graph.lastUpdatedAt || Date.now()
      daysActive = Math.max(1, Math.ceil((lastUpdated - oldestCreatedAt) / (1000 * 60 * 60 * 24)))
    }

    // ── Avatar Info ────────────────────────────────────────────────────────
    const tierInfo = AVATAR_TIERS.find(t => t.tier === gamification.avatarTier) ?? AVATAR_TIERS[0]

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
