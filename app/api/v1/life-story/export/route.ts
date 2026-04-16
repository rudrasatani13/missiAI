import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getRequestContext } from "@cloudflare/next-on-pages"
import type { KVStore } from "@/types"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}
import { getLifeGraph } from '@/lib/memory/life-graph'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'

export const runtime = 'edge'

function sanitizeExportText(text: string): string {
  // Simple sanitize just to prevent XSS in json if ever carelessly rendered
  return sanitizeMemories(text || '').replace(/<[^>]*>?/gm, '')
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const kv = getKV()
    if (!kv) {
      return NextResponse.json({ error: 'KV storage missing' }, { status: 500 })
    }

    // Rate Limiting Check: 3 per day
    const dateStr = new Date().toISOString().split('T')[0]
    const rateLimitKey = `ratelimit:life-story-export:${userId}:${dateStr}`
    
    const currentCountStr = await kv.get(rateLimitKey)
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0
    
    if (currentCount >= 3) {
      return NextResponse.json({ error: 'Rate limit exceeded for exports today.' }, { status: 429 })
    }

    const graph = await getLifeGraph(kv, userId)

    // Load chapters from cache
    let chapters = []
    const cacheKey = `life-story:chapters:${userId}`
    const cachedRaw = await kv.get(cacheKey)
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw)
        chapters = cached.chapters || []
      } catch(e) {}
    }

    // Load current year review if exists
    const currentYear = new Date().getFullYear()
    let currentYearReview = null
    const yrCacheKey = `life-story:year-review:${userId}:${currentYear}`
    const yrCachedRaw = await kv.get(yrCacheKey)
    if (yrCachedRaw) {
      try {
        currentYearReview = JSON.parse(yrCachedRaw)
      } catch(e) {}
    }

    // Sanitize everything
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
      graph: {
        ...graph,
        nodes: sanitizedNodes
      },
      chapters: sanitizedChapters,
      currentYearReview: sanitizedYearReview
    }

    await kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 86400 }) // 1 day

    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('Content-Disposition', `attachment; filename="missi-life-story-${dateStr}.json"`)

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('Life Story Export API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
