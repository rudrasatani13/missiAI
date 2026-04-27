// ─── Public Space invite preview ─────────────────────────────────────────────
//
// This page is public (listed in middleware.ts). It does a KV *preview*
// read of the invite using peekInvite — which does NOT consume the token —
// so an unauthenticated visitor can see the Space name before signing in.
// Consuming the token only happens when the user clicks "Join" (Clerk auth +
// plan gate enforced by /api/v1/spaces/join).

import { auth } from '@clerk/nextjs/server'
import { peekInvite, getSpace, verifyMembership } from '@/lib/spaces/space-store'
import { getKV } from '@/lib/spaces/space-api-helpers'
import type { SpaceMetadata } from '@/types/spaces'
import JoinActions from '@/components/join/JoinActions'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function JoinPage({ params }: PageProps) {
  const { token } = await params

  const kv = getKV()
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))

  let space: SpaceMetadata | null = null
  let alreadyMember = false
  let status: 'ok' | 'invalid' | 'unavailable' = 'ok'

  if (!kv) {
    status = 'unavailable'
  } else {
    try {
      const invite = await peekInvite(kv, token)
      if (!invite) {
        status = 'invalid'
      } else {
        space = await getSpace(kv, invite.spaceId)
        if (!space) {
          status = 'invalid'
        } else if (userId) {
          const member = await verifyMembership(kv, invite.spaceId, userId)
          alreadyMember = !!member
        }
      }
    } catch {
      status = 'invalid'
    }
  }

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center px-4 py-16"
      style={{
        background:
          'radial-gradient(700px circle at 50% 0%, rgba(139,92,246,0.10), transparent 60%), #08080c',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: 'rgba(20,20,26,0.55)',
          backdropFilter: 'blur(24px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow:
            '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {status === 'unavailable' ? (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white/90 mb-2">
              Service unavailable
            </h1>
            <p className="text-sm text-white/50">
              We couldn&apos;t load this invite right now. Please try again shortly.
            </p>
          </div>
        ) : status === 'invalid' || !space ? (
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h1 className="text-xl font-semibold text-white/90 mb-2">
              This invite has expired or is invalid
            </h1>
            <p className="text-sm text-white/50">
              Ask the person who sent this link to generate a new invite.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="text-5xl mb-4">{space.emoji || '🫂'}</div>
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
              You&apos;ve been invited to a Missi Space
            </p>
            <h1 className="text-2xl font-semibold text-white mb-2">
              {space.name}
            </h1>
            {space.description ? (
              <p className="text-sm text-white/55 mb-4 max-w-sm">
                {space.description}
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-xs text-white/45 mb-8">
              <span className="capitalize">{space.category}</span>
              <span>·</span>
              <span>
                {space.memberCount} member{space.memberCount === 1 ? '' : 's'}
              </span>
            </div>

            <JoinActions
              token={token}
              signedIn={!!userId}
              alreadyMember={alreadyMember}
              spaceId={space.spaceId}
              spaceName={space.name}
            />

            <p className="text-[11px] text-white/35 mt-6 max-w-sm leading-relaxed">
              Joining gives the members of this Space access to the shared memory
              you add. Your personal memories stay private.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
