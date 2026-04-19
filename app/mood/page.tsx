'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import MoodTimelineClient from '@/components/mood/MoodTimelineClient'
import { ChatShell } from '@/components/shell/ChatShell'

export default function MoodPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) return null

  return (
    <ChatShell>
      <MoodTimelineClient />
    </ChatShell>
  )
}
