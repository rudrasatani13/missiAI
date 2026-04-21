// ─── Missi Spaces Types ──────────────────────────────────────────────────────
//
// Shared AI memory environments for 2-10 people. All Space data lives under
// the `space:*` KV key prefix and NEVER mixes with personal `lifegraph:*`
// storage. Personal memories remain private; only explicitly shared nodes
// reach the Space graph.

import type { LifeNode, MemoryCategory } from '@/types/memory'

export type SpaceRole = 'owner' | 'member'

export type SpaceCategory =
  | 'couple'
  | 'family'
  | 'friends'
  | 'study'
  | 'work'
  | 'other'

export interface SpaceMember {
  /** Clerk userId */
  userId: string
  role: SpaceRole
  /** Display name cached from Clerk at join time (max 50 chars) */
  displayName: string
  /** Unix ms */
  joinedAt: number
  /** Unix ms — bumped on every Space read/write for this user */
  lastActiveAt: number
}

export interface SpaceMetadata {
  /** nanoid(16) */
  spaceId: string
  /** Sanitized, max 50 chars */
  name: string
  /** Sanitized, max 200 chars */
  description: string
  category: SpaceCategory
  /** Single emoji (max 4 UTF-16 code units to cover ZWJ sequences) */
  emoji: string
  createdAt: number
  ownerUserId: string
  /** Tracked separately for fast listing; always 2-10 */
  memberCount: number
  /**
   * Active invite tokens for this Space (max 5). Stored in metadata so
   * dissolution can explicitly delete each `space:invite:${token}` record —
   * Cloudflare KV has no wildcard delete.
   */
  activeInviteTokens: string[]
}

export interface SpaceInvite {
  /** 16-char HMAC-derived hex token */
  token: string
  spaceId: string
  inviterUserId: string
  createdAt: number
  /** Unix ms, 48h after creation */
  expiresAt: number
  used: boolean
}

/**
 * A node in a Space's shared graph. Reuses the `LifeNode` shape as-is with
 * Space-specific attribution fields. `userId` on the base LifeNode still
 * references the contributor for historical compat, but `contributorId` is
 * the authoritative attribution field for Spaces.
 */
export interface SharedMemoryNode extends LifeNode {
  spaceId: string
  /** Clerk userId who added this node to the Space */
  contributorId: string
  /** Cached at write time; displayed in UI & prompt */
  contributorDisplayName: string
  /** Always 'space' — there is no other visibility level */
  visibility: 'space'
}

/** Lightweight row for `/spaces` dashboard listings. */
export interface SpaceSummary {
  spaceId: string
  name: string
  emoji: string
  category: SpaceCategory
  memberCount: number
  userRole: SpaceRole
  /** Unix ms of most-recent node activity (or Space creation if none) */
  recentActivity: number
}

/** Enum helper — mirrors MemoryCategory for Zod schema reuse. */
export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  'person',
  'goal',
  'habit',
  'preference',
  'event',
  'emotion',
  'skill',
  'place',
  'belief',
  'relationship',
] as const

export const SPACE_CATEGORIES: readonly SpaceCategory[] = [
  'couple',
  'family',
  'friends',
  'study',
  'work',
  'other',
] as const

export const MAX_SPACE_MEMBERS = 10
export const MAX_ACTIVE_INVITES = 5
export const INVITE_TTL_SECONDS = 172_800 // 48 hours
export const SPACE_WRITE_DAILY_LIMIT = 50
export const SPACE_CREATE_WEEKLY_LIMIT = 5
