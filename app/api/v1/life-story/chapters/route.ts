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

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
          // If fresh (graph version within 5 of current)
          if (cached.graphVersion !== undefined && Math.abs(graph.version - cached.graphVersion) <= 5) {
            return NextResponse.json({
              chapters: cached.chapters,
              generatedAt: cached.generatedAt,
              totalNodes: graph.nodes.length
            })
          }
        } catch (e) {
          // parse error, ignore and regenerate
        }
      }
    }

    // Process
    const geminiApiKey = process.env.GEMINI_API_KEY || ''
    
    // In Edge, Promise.race + generate generates an async chunk. Wait for it fully.
    const chapters = await detectChapters(graph, geminiApiKey)
    const generatedAt = Date.now()

    // Cache
    await kv.put(cacheKey, JSON.stringify({
      chapters,
      graphVersion: graph.version,
      generatedAt
    })) // no TTL as requested

    return NextResponse.json({
      chapters,
      generatedAt,
      totalNodes: graph.nodes.length
    })

  } catch (error) {
    console.error('Life Story Chapters API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
