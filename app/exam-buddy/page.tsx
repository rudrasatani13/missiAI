'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { ChatShell } from '@/components/shell/ChatShell'
import { ExamBuddyHub } from '@/components/exam-buddy/ExamBuddyHub'

export default function ExamBuddyPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/sign-in')
    }
  }, [isLoaded, user, router])

  if (!isLoaded || !user) return null

  return (
    <ChatShell>
      <div
        className="relative min-h-full flex flex-col items-center justify-start px-4 py-5 md:px-6 md:py-8 lg:px-8"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {/* Ambient field */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(620px circle at 16% 12%, rgba(96,165,250,0.12), transparent 54%), radial-gradient(520px circle at 82% 16%, rgba(168,85,247,0.1), transparent 58%), radial-gradient(460px circle at 72% 86%, rgba(251,191,36,0.08), transparent 60%)',
            filter: 'blur(140px)',
          }}
        />
        <div className="w-full max-w-5xl relative z-10">
          <ExamBuddyHub />
        </div>
      </div>
    </ChatShell>
  )
}
