import { NextResponse } from 'next/server'
import { getAllLibraryStories, getLibraryStoriesByCategory } from '@/lib/sleep-sessions/library-stories'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import type { LibraryStoryCategory } from '@/types/sleep-sessions'

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const { searchParams } = new URL(req.url)
  const categoryStr = searchParams.get('category')
  
  let stories = []

  if (categoryStr) {
      stories = getLibraryStoriesByCategory(categoryStr as LibraryStoryCategory)
  } else {
      stories = getAllLibraryStories()
  }

  return NextResponse.json({ success: true, data: { stories } })
}
