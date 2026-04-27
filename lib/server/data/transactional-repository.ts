import {
  getCloudflareD1Binding,
  type CloudflareD1Database,
} from "@/lib/server/platform/bindings"

export type TransactionalRepositoryDomain = "mood" | "gamification" | "spaces" | "analytics"
export type TransactionalRepositoryRolloutTrack = "phase4_track_b" | "phase4_track_c" | "phase4_track_d"

export interface TransactionalRepositoryDescriptor {
  domain: TransactionalRepositoryDomain
  authority: "d1"
  rolloutTrack: TransactionalRepositoryRolloutTrack
  tables: readonly string[]
}

const TRANSACTIONAL_REPOSITORY_DESCRIPTORS: Record<TransactionalRepositoryDomain, TransactionalRepositoryDescriptor> = {
  mood: {
    domain: "mood",
    authority: "d1",
    rolloutTrack: "phase4_track_b",
    tables: ["mood_entries", "mood_insights"],
  },
  gamification: {
    domain: "gamification",
    authority: "d1",
    rolloutTrack: "phase4_track_b",
    tables: ["gamification_state", "xp_grants", "habit_streaks"],
  },
  spaces: {
    domain: "spaces",
    authority: "d1",
    rolloutTrack: "phase4_track_c",
    tables: ["spaces", "space_members", "space_invites", "space_graph_versions"],
  },
  analytics: {
    domain: "analytics",
    authority: "d1",
    rolloutTrack: "phase4_track_d",
    tables: ["analytics_events", "analytics_aggregation_state"],
  },
}

export interface TransactionalRepositoryContext<TDomain extends TransactionalRepositoryDomain = TransactionalRepositoryDomain> {
  domain: TDomain
  descriptor: TransactionalRepositoryDescriptor
  db: CloudflareD1Database
  now: () => number
}

export function listTransactionalRepositoryDescriptors(): TransactionalRepositoryDescriptor[] {
  return Object.values(TRANSACTIONAL_REPOSITORY_DESCRIPTORS)
}

export function getTransactionalRepositoryDescriptor(
  domain: TransactionalRepositoryDomain,
): TransactionalRepositoryDescriptor {
  return TRANSACTIONAL_REPOSITORY_DESCRIPTORS[domain]
}

export function createTransactionalRepositoryContext<TDomain extends TransactionalRepositoryDomain>(
  domain: TDomain,
  options?: {
    db?: CloudflareD1Database | null
    now?: () => number
  },
): TransactionalRepositoryContext<TDomain> | null {
  const db = options?.db ?? getCloudflareD1Binding()
  if (!db) return null

  return {
    domain,
    descriptor: getTransactionalRepositoryDescriptor(domain),
    db,
    now: options?.now ?? Date.now,
  }
}

export function requireTransactionalRepositoryContext<TDomain extends TransactionalRepositoryDomain>(
  domain: TDomain,
  options?: {
    db?: CloudflareD1Database | null
    now?: () => number
  },
): TransactionalRepositoryContext<TDomain> {
  const context = createTransactionalRepositoryContext(domain, options)
  if (!context) {
    throw new Error(`Transactional repository binding is unavailable for domain "${domain}"`)
  }
  return context
}
