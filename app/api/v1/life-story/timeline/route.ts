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
import { detectChapters } from '@/lib/life-story/chapter-detector'
import { TimelineEvent } from '@/types/life-story'
import { MemoryCategory } from '@/types/memory'

export const runtime = 'edge'

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

    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const categoryParam = searchParams.get('category')

    const graph = await getLifeGraph(kv, userId)

    // Ensure we have current chapters
    const cacheKey = `life-story:chapters:${userId}`
    let chapters = []
    
    const cachedRaw = await kv.get(cacheKey)
    let needsRefresh = true
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw)
        if (cached.graphVersion !== undefined && Math.abs(graph.version - cached.graphVersion) <= 5) {
          chapters = cached.chapters
          needsRefresh = false
        }
      } catch(e) {}
    }

    if (needsRefresh) {
      chapters = await detectChapters(graph)
      await kv.put(cacheKey, JSON.stringify({
        chapters,
        graphVersion: graph.version,
        generatedAt: Date.now()
      }))
    }

    // Create a map for O(1) chapter lookup by nodeId
    const nodeToChapterIdMap = new Map<string, string>()
    for (const chapter of chapters) {
      if (chapter.nodeIds) {
        for (const nodeId of chapter.nodeIds) {
          nodeToChapterIdMap.set(nodeId, chapter.id)
        }
      }
    }

    // Transform nodes into TimelineEvent[]
    let events: TimelineEvent[] = []
    for (const node of graph.nodes) {
      const chapterId = nodeToChapterIdMap.get(node.id)
      events.push({
        nodeId: node.id,
        timestamp: node.createdAt,
        title: node.title,
        category: node.category as MemoryCategory,
        emotionalWeight: node.emotionalWeight || 0.5,
        chapterId: chapterId || null
      })
    }

    // Filter by query params if provided
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

    // Sort ascending
    events.sort((a, b) => a.timestamp - b.timestamp)

    return NextResponse.json({
      events,
      chapters
    })

  } catch (error) {
    console.error('Life Story Timeline API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
