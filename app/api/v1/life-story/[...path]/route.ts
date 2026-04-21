// ─── Life Story — Consolidated Catch-All Route ────────────────────────────────
//
// Handles: chapters, timeline, constellation, export, year-review
// This consolidation reduces 5 separate edge function bundles into 1,
// saving ~2 MiB of duplicated dependency overhead.

import { NextResponse } from 'next/server'
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/auth'
import { z } from 'zod'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { detectChapters } from '@/lib/life-story/chapter-detector'
import { computeConstellationLayout } from '@/lib/life-story/constellation-layout'
import { generateYearInReview } from '@/lib/life-story/year-review-generator'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { TimelineEvent } from '@/types/life-story'
import { MemoryCategory } from '@/types/memory'
import { ConstellationGrouping } from '@/types/life-story'
import type { KVStore } from "@/types"

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

// ─── Chapters Handler ─────────────────────────────────────────────────────────

async function handleChapters(req: Request, userId: string) {
  const { searchParams } = new URL(req.url)
  const refresh = searchParams.get('refresh') === 'true'

  const kv = getKV()
  if (!kv) {
    return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
  }

  const graph = await getLifeGraph(kv, userId)

  // Check cache
  const cacheKey = `life-story:chapters:${userId}`
  if (!refresh) {
    const cachedRaw = await kv.get(cacheKey)
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw)
        if (cached.graphVersion !== undefined && Math.abs(graph.version - cached.graphVersion) <= 5) {
          return NextResponse.json({
            chapters: cached.chapters,
            generatedAt: cached.generatedAt,
            totalNodes: graph.nodes.length
          })
        }
      } catch {
        // parse error, ignore and regenerate
      }
    }
  }

  const chapters = await detectChapters(graph)
  const generatedAt = Date.now()

  await kv.put(cacheKey, JSON.stringify({
    chapters,
    graphVersion: graph.version,
    generatedAt
  }))

  return NextResponse.json({
    chapters,
    generatedAt,
    totalNodes: graph.nodes.length
  })
}

// ─── Timeline Handler ─────────────────────────────────────────────────────────

async function handleTimeline(req: Request, userId: string) {
  const kv = getKV()
  if (!kv) {
    return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get('year')
  const categoryParam = searchParams.get('category')

  const graph = await getLifeGraph(kv, userId)

  const cacheKey = `life-story:chapters:${userId}`
  let chapters: any[] = []

  const cachedRaw = await kv.get(cacheKey)
  let needsRefresh = true
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw)
      if (cached.graphVersion !== undefined && Math.abs(graph.version - cached.graphVersion) <= 5) {
        chapters = cached.chapters
        needsRefresh = false
      }
    } catch {}
  }

  if (needsRefresh) {
    chapters = await detectChapters(graph)
    await kv.put(cacheKey, JSON.stringify({
      chapters,
      graphVersion: graph.version,
      generatedAt: Date.now()
    }))
  }

  const nodeChapterMap = new Map<string, string>()
  if (chapters) {
    for (const chapter of chapters) {
      if (chapter && Array.isArray(chapter.nodeIds)) {
        for (const nodeId of chapter.nodeIds) {
          nodeChapterMap.set(nodeId, chapter.id)
        }
      }
    }
  }

  let events: TimelineEvent[] = []
  for (const node of graph.nodes) {
    events.push({
      nodeId: node.id,
      timestamp: node.createdAt,
      title: node.title,
      category: node.category as MemoryCategory,
      emotionalWeight: node.emotionalWeight || 0.5,
      chapterId: nodeChapterMap.get(node.id) || null
    })
  }

  if (yearParam) {
    const year = parseInt(yearParam, 10)
    if (!isNaN(year)) {
      events = events.filter(e => {
        const d = new Date(e.timestamp)
        return d.getFullYear() === year
      })
    }
  }

  if (categoryParam) {
    events = events.filter(e => e.category === categoryParam)
  }

  events.sort((a, b) => a.timestamp - b.timestamp)

  return NextResponse.json({ events, chapters })
}

// ─── Constellation Handler ────────────────────────────────────────────────────

const modeSchema = z.enum(['by_category', 'by_time', 'by_emotion', 'by_people'])

async function handleConstellation(req: Request, userId: string) {
  const { searchParams } = new URL(req.url)
  const modeRaw = searchParams.get('mode')

  const parseResult = modeSchema.safeParse(modeRaw)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid mode parameter' }, { status: 400 })
  }
  const mode = parseResult.data as ConstellationGrouping['mode']

  const kv = getKV()
  if (!kv) {
    return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
  }

  const graph = await getLifeGraph(kv, userId)
  const grouping = computeConstellationLayout(graph, mode)

  return NextResponse.json({ grouping, nodeCount: graph.nodes.length })
}

// ─── Export Handler ───────────────────────────────────────────────────────────

function sanitizeExportText(text: string): string {
  return sanitizeMemories(text || '').replace(/<[^>]*>?/gm, '')
}

async function handleExport(req: Request, userId: string) {
  const kv = getKV()
  if (!kv) {
    return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
  }

  const dateStr = new Date().toISOString().split('T')[0]
  const rateLimitKey = `ratelimit:life-story-export:${userId}:${dateStr}`

  const currentCountStr = await kv.get(rateLimitKey)
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0

  if (currentCount >= 3) {
    return NextResponse.json({ error: 'Rate limit exceeded for exports today.' }, { status: 429 })
  }

  const graph = await getLifeGraph(kv, userId)

  let chapters: any[] = []
  const cacheKey = `life-story:chapters:${userId}`
  const cachedRaw = await kv.get(cacheKey)
  if (cachedRaw) {
    try {
      chapters = JSON.parse(cachedRaw).chapters || []
    } catch {}
  }

  const currentYear = new Date().getFullYear()
  let currentYearReview = null
  const yrCacheKey = `life-story:year-review:${userId}:${currentYear}`
  const yrCachedRaw = await kv.get(yrCacheKey)
  if (yrCachedRaw) {
    try {
      currentYearReview = JSON.parse(yrCachedRaw)
    } catch {}
  }

  const sanitizedNodes = graph.nodes.map(n => ({
    ...n,
    title: sanitizeExportText(n.title),
    detail: sanitizeExportText(n.detail),
    tags: n.tags.map(sanitizeExportText),
    people: n.people.map(sanitizeExportText)
  }))

  const sanitizedChapters = chapters.map((c: any) => ({
    ...c,
    title: sanitizeExportText(c.title),
    description: sanitizeExportText(c.description),
  }))

  let sanitizedYearReview = null
  if (currentYearReview) {
    sanitizedYearReview = {
      ...currentYearReview,
      narrative: sanitizeExportText(currentYearReview.narrative),
      highlights: (currentYearReview.highlights || []).map(sanitizeExportText)
    }
  }

  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      nodeCount: sanitizedNodes.length
    },
    graph: { ...graph, nodes: sanitizedNodes },
    chapters: sanitizedChapters,
    currentYearReview: sanitizedYearReview
  }

  await kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 86400 })

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Content-Disposition', `attachment; filename="missi-life-story-${dateStr}.json"`)

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers
  })
}

// ─── Year Review Handler ──────────────────────────────────────────────────────

const yearSchema = z.coerce.number().int().min(2020).max(new Date().getFullYear() + 1)

function getIsoWeek() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
}

async function handleYearReview(req: Request, userId: string) {
  const { searchParams } = new URL(req.url)
  const yearRaw = searchParams.get('year')

  const parseResult = yearSchema.safeParse(yearRaw)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 })
  }
  const year = parseResult.data

  const kv = getKV()
  if (!kv) {
    return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
  }

  const cacheKey = `life-story:year-review:${userId}:${year}`
  const cachedRaw = await kv.get(cacheKey)
  if (cachedRaw) {
    try {
      return NextResponse.json(JSON.parse(cachedRaw))
    } catch {}
  }

  const plan = await getUserPlan(userId)
  const limit = (plan === 'plus' || plan === 'pro') ? 10 : 2
  const isoWeek = getIsoWeek()
  const rateLimitKey = `ratelimit:year-review:${userId}:${isoWeek}`

  const currentCountStr = await kv.get(rateLimitKey)
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0

  if (currentCount >= limit) {
    return NextResponse.json({ error: 'Rate limit exceeded for Year in Review generations this week.' }, { status: 429 })
  }

  const graph = await getLifeGraph(kv, userId)
  const review = await generateYearInReview(graph, year)

  await kv.put(cacheKey, JSON.stringify(review), { expirationTtl: 604800 })
  await kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 604800 })

  return NextResponse.json(review)
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return unauthorizedResponse()
    }
    throw error
  }

  try {
    const { path } = await params
    switch (path[0]) {
      case 'chapters':
        return handleChapters(request, userId)
      case 'timeline':
        return handleTimeline(request, userId)
      case 'constellation':
        return handleConstellation(request, userId)
      case 'export':
        return handleExport(request, userId)
      case 'year-review':
        return handleYearReview(request, userId)
      default:
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('Life Story API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
