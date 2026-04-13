import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import MoodTimelineClient from '@/components/mood/MoodTimelineClient'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export default async function MoodPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <MoodTimelineClient />
}
