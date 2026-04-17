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
import { generateYearInReview } from '@/lib/life-story/year-review-generator'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { z } from 'zod'

export const runtime = 'edge'

const yearSchema = z.coerce.number().int().min(2020).max(new Date().getFullYear() + 1)

function getIsoWeek() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
        const cached = JSON.parse(cachedRaw)
        return NextResponse.json(cached)
      } catch(e) {}
    }

    // Rate Limiting Check
    const plan = await getUserPlan(userId)
    const limit = (plan === 'plus' || plan === 'pro') ? 10 : 2
    const isoWeek = getIsoWeek()
    const rateLimitKey = `ratelimit:year-review:${userId}:${isoWeek}`
    
    // Minimal atomic rate limit using KV
    const currentCountStr = await kv.get(rateLimitKey)
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0
    
    if (currentCount >= limit) {
      return NextResponse.json({ error: 'Rate limit exceeded for Year in Review generations this week.' }, { status: 429 })
    }

    const graph = await getLifeGraph(kv, userId)

    const review = await generateYearInReview(graph, year)

    // Cache the review with 7-day TTL
    await kv.put(cacheKey, JSON.stringify(review), { expirationTtl: 604800 })
    
    // Increment rate limit
    await kv.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 604800 })

    return NextResponse.json(review)

  } catch (error) {
    console.error('Life Story Year Review API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
