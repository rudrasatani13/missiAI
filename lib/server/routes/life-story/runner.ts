import { NextResponse } from 'next/server'
import { computeConstellationLayout } from '@/lib/life-story/constellation-layout'
import { generateYearInReview } from '@/lib/life-story/year-review-generator'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { getLifeGraphReadSnapshot } from '@/lib/memory/life-graph'
import {
  buildLifeStoryExportRateLimitKey,
  buildLifeStoryNodeChapterMap,
  buildLifeStoryTimelineEvents,
  buildLifeStoryYearReviewCacheKey,
  buildLifeStoryYearReviewRateLimitKey,
  filterLifeStoryTimelineEvents,
  getCachedLifeStoryChapters,
  getCachedLifeStoryYearReview,
  getLifeStoryChapters,
  getLifeStoryIsoWeek,
  parseLifeStoryConstellationMode,
  parseLifeStoryYear,
  requireLifeStoryKV,
  sanitizeLifeStoryExportText,
} from '@/lib/server/routes/life-story/helpers'
import type { YearInReview } from '@/types/life-story'

const LIFE_STORY_CONTEXT_GRAPH_READ_OPTIONS = { limit: 500, newestFirst: true } as const

export async function runLifeStoryChaptersRoute(req: Request, userId: string): Promise<Response> {
  const kvResult = requireLifeStoryKV()
  if (!kvResult.ok) return kvResult.response

  const refresh = new URL(req.url).searchParams.get('refresh') === 'true'
  const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, LIFE_STORY_CONTEXT_GRAPH_READ_OPTIONS)
  const { chapters, generatedAt } = await getLifeStoryChapters(kvResult.kv, userId, graph, { refresh })

  return NextResponse.json({
    chapters,
    generatedAt,
    totalNodes: graph.nodes.length,
  })
}

export async function runLifeStoryTimelineRoute(req: Request, userId: string): Promise<Response> {
  const kvResult = requireLifeStoryKV()
  if (!kvResult.ok) return kvResult.response

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get('year')
  const categoryParam = searchParams.get('category')

  const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, LIFE_STORY_CONTEXT_GRAPH_READ_OPTIONS)
  const { chapters } = await getLifeStoryChapters(kvResult.kv, userId, graph)
  const nodeChapterMap = buildLifeStoryNodeChapterMap(chapters)
  const events = filterLifeStoryTimelineEvents(
    buildLifeStoryTimelineEvents(graph, nodeChapterMap),
    { yearParam, categoryParam },
  )

  return NextResponse.json({ events, chapters })
}

export async function runLifeStoryConstellationRoute(req: Request, userId: string): Promise<Response> {
  const modeResult = parseLifeStoryConstellationMode(req)
  if (!modeResult.ok) return modeResult.response

  const kvResult = requireLifeStoryKV()
  if (!kvResult.ok) return kvResult.response

  const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, LIFE_STORY_CONTEXT_GRAPH_READ_OPTIONS)
  const grouping = computeConstellationLayout(graph, modeResult.mode)

  return NextResponse.json({ grouping, nodeCount: graph.nodes.length })
}

export async function runLifeStoryExportRoute(_req: Request, userId: string): Promise<Response> {
  const kvResult = requireLifeStoryKV()
  if (!kvResult.ok) return kvResult.response

  const dateStr = new Date().toISOString().split('T')[0]
  const rateLimitKey = buildLifeStoryExportRateLimitKey(userId, dateStr)
  const currentCountStr = await kvResult.kv.get(rateLimitKey)
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0

  if (currentCount >= 3) {
    return NextResponse.json({ error: 'Rate limit exceeded for exports today.' }, { status: 429 })
  }

  const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId)
  const chapters = await getCachedLifeStoryChapters(kvResult.kv, userId)

  const currentYear = new Date().getFullYear()
  const currentYearReview = await getCachedLifeStoryYearReview(kvResult.kv, userId, currentYear)

  const sanitizedNodes = graph.nodes.map((node) => ({
    ...node,
    title: sanitizeLifeStoryExportText(node.title),
    detail: sanitizeLifeStoryExportText(node.detail),
    tags: node.tags.map(sanitizeLifeStoryExportText),
    people: node.people.map(sanitizeLifeStoryExportText),
  }))

  const sanitizedChapters = chapters.map((chapter) => ({
    ...chapter,
    title: sanitizeLifeStoryExportText(chapter.title),
    description: sanitizeLifeStoryExportText(chapter.description),
  }))

  let sanitizedYearReview: YearInReview | null = null
  if (currentYearReview) {
    sanitizedYearReview = {
      ...currentYearReview,
      narrative: sanitizeLifeStoryExportText(currentYearReview.narrative),
      highlights: (currentYearReview.highlights || []).map(sanitizeLifeStoryExportText),
    }
  }

  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      nodeCount: sanitizedNodes.length,
    },
    graph: { ...graph, nodes: sanitizedNodes },
    chapters: sanitizedChapters,
    currentYearReview: sanitizedYearReview,
  }

  await kvResult.kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 86400 })

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Content-Disposition', `attachment; filename="missi-life-story-${dateStr}.json"`)

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers,
  })
}

export async function runLifeStoryYearReviewRoute(req: Request, userId: string): Promise<Response> {
  const yearResult = parseLifeStoryYear(req)
  if (!yearResult.ok) return yearResult.response

  const kvResult = requireLifeStoryKV()
  if (!kvResult.ok) return kvResult.response

  const cacheKey = buildLifeStoryYearReviewCacheKey(userId, yearResult.year)
  const cachedReview = await getCachedLifeStoryYearReview(kvResult.kv, userId, yearResult.year)
  if (cachedReview) {
    return NextResponse.json(cachedReview)
  }

  const plan = await getUserPlan(userId)
  const limit = plan === 'plus' || plan === 'pro' ? 10 : 2
  const isoWeek = getLifeStoryIsoWeek()
  const rateLimitKey = buildLifeStoryYearReviewRateLimitKey(userId, isoWeek)

  const currentCountStr = await kvResult.kv.get(rateLimitKey)
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0

  if (currentCount >= limit) {
    return NextResponse.json({ error: 'Rate limit exceeded for Year in Review generations this week.' }, { status: 429 })
  }

  const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, LIFE_STORY_CONTEXT_GRAPH_READ_OPTIONS)
  const review = await generateYearInReview(graph, yearResult.year)

  await kvResult.kv.put(cacheKey, JSON.stringify(review), { expirationTtl: 604800 })
  await kvResult.kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 604800 })

  return NextResponse.json(review)
}
