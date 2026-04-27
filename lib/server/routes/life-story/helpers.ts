import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { detectChapters } from '@/lib/life-story/chapter-detector'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import type { KVStore } from '@/types'
import type { LifeChapter, TimelineEvent, YearInReview, ConstellationGrouping } from '@/types/life-story'
import type { LifeGraph } from '@/types/memory'

const modeSchema = z.enum(['by_category', 'by_time', 'by_emotion', 'by_people'])
const yearSchema = z.coerce.number().int().min(2020).max(new Date().getFullYear() + 1)

type LifeStoryChapterCache = {
  chapters: LifeChapter[]
  graphVersion?: number
  generatedAt: number
}

export type LifeStoryAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedLifeStoryUserId(): Promise<LifeStoryAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }

    throw error
  }
}

export type LifeStoryKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireLifeStoryKV(): LifeStoryKvResult {
  const kv = getCloudflareKVBinding()
  if (!kv) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'KV storage missing' }, { status: 500 }),
    }
  }

  return { ok: true, kv }
}

export type LifeStoryConstellationModeResult =
  | { ok: true; mode: ConstellationGrouping['mode'] }
  | { ok: false; response: Response }

export function parseLifeStoryConstellationMode(
  req: Pick<Request, 'url'>,
): LifeStoryConstellationModeResult {
  const modeRaw = new URL(req.url).searchParams.get('mode')
  const parseResult = modeSchema.safeParse(modeRaw)
  if (!parseResult.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid mode parameter' }, { status: 400 }),
    }
  }

  return {
    ok: true,
    mode: parseResult.data,
  }
}

export type LifeStoryYearResult =
  | { ok: true; year: number }
  | { ok: false; response: Response }

export function parseLifeStoryYear(req: Pick<Request, 'url'>): LifeStoryYearResult {
  const yearRaw = new URL(req.url).searchParams.get('year')
  const parseResult = yearSchema.safeParse(yearRaw)
  if (!parseResult.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 }),
    }
  }

  return {
    ok: true,
    year: parseResult.data,
  }
}

async function readLifeStoryJson<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function buildLifeStoryChaptersCacheKey(userId: string): string {
  return `life-story:chapters:${userId}`
}

export function buildLifeStoryYearReviewCacheKey(userId: string, year: number): string {
  return `life-story:year-review:${userId}:${year}`
}

export function buildLifeStoryExportRateLimitKey(userId: string, dateStr: string): string {
  return `ratelimit:life-story-export:${userId}:${dateStr}`
}

export function buildLifeStoryYearReviewRateLimitKey(userId: string, isoWeek: string): string {
  return `ratelimit:year-review:${userId}:${isoWeek}`
}

export async function getLifeStoryChapters(
  kv: KVStore,
  userId: string,
  graph: LifeGraph,
  options: { refresh?: boolean } = {},
): Promise<{ chapters: LifeChapter[]; generatedAt: number }> {
  const cacheKey = buildLifeStoryChaptersCacheKey(userId)
  if (!options.refresh) {
    const cached = await readLifeStoryJson<LifeStoryChapterCache>(kv, cacheKey)
    if (
      cached &&
      cached.graphVersion !== undefined &&
      Math.abs(graph.version - cached.graphVersion) <= 5
    ) {
      return {
        chapters: cached.chapters,
        generatedAt: cached.generatedAt,
      }
    }
  }

  const chapters = await detectChapters(graph)
  const generatedAt = Date.now()
  await kv.put(
    cacheKey,
    JSON.stringify({
      chapters,
      graphVersion: graph.version,
      generatedAt,
    }),
  )

  return { chapters, generatedAt }
}

export async function getCachedLifeStoryChapters(
  kv: KVStore,
  userId: string,
): Promise<LifeChapter[]> {
  const cached = await readLifeStoryJson<LifeStoryChapterCache>(kv, buildLifeStoryChaptersCacheKey(userId))
  return cached?.chapters ?? []
}

export async function getCachedLifeStoryYearReview(
  kv: KVStore,
  userId: string,
  year: number,
): Promise<YearInReview | null> {
  return readLifeStoryJson<YearInReview>(kv, buildLifeStoryYearReviewCacheKey(userId, year))
}

export function buildLifeStoryNodeChapterMap(chapters: LifeChapter[]): Map<string, string> {
  const nodeChapterMap = new Map<string, string>()
  for (const chapter of chapters) {
    if (chapter && Array.isArray(chapter.nodeIds)) {
      for (const nodeId of chapter.nodeIds) {
        nodeChapterMap.set(nodeId, chapter.id)
      }
    }
  }
  return nodeChapterMap
}

export function buildLifeStoryTimelineEvents(
  graph: LifeGraph,
  nodeChapterMap: Map<string, string>,
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const node of graph.nodes) {
    events.push({
      nodeId: node.id,
      timestamp: node.createdAt,
      title: node.title,
      category: node.category,
      emotionalWeight: node.emotionalWeight || 0.5,
      chapterId: nodeChapterMap.get(node.id) || null,
    })
  }
  return events
}

export function filterLifeStoryTimelineEvents(
  events: TimelineEvent[],
  options: { yearParam: string | null; categoryParam: string | null },
): TimelineEvent[] {
  let filteredEvents = events

  if (options.yearParam) {
    const year = parseInt(options.yearParam, 10)
    if (!Number.isNaN(year)) {
      filteredEvents = filteredEvents.filter((event) => {
        const date = new Date(event.timestamp)
        return date.getFullYear() === year
      })
    }
  }

  if (options.categoryParam) {
    filteredEvents = filteredEvents.filter((event) => event.category === options.categoryParam)
  }

  return filteredEvents.sort((a, b) => a.timestamp - b.timestamp)
}

export function sanitizeLifeStoryExportText(text: string): string {
  return sanitizeMemories(text || '').replace(/<[^>]*>?/gm, '')
}

export function getLifeStoryIsoWeek(date = new Date()): string {
  const workingDate = new Date(date)
  workingDate.setHours(0, 0, 0, 0)
  workingDate.setDate(workingDate.getDate() + 3 - (workingDate.getDay() + 6) % 7)
  const week1 = new Date(workingDate.getFullYear(), 0, 4)
  const weekNumber = 1 + Math.round(((workingDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${workingDate.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
}
