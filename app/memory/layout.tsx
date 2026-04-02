import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default async function MemoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }
  return <>{children}</>
}
