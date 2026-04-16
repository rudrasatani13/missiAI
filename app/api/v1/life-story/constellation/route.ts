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
import { computeConstellationLayout } from '@/lib/life-story/constellation-layout'
import { z } from 'zod'
import { ConstellationGrouping } from '@/types/life-story'

export const runtime = 'edge'

const modeSchema = z.enum(['by_category', 'by_time', 'by_emotion', 'by_people'])

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    return NextResponse.json({
      grouping,
      nodeCount: graph.nodes.length
    })

  } catch (error) {
    console.error('Life Story Constellation API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
