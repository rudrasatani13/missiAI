import { isRecord } from "@/lib/utils/is-record"
import type { KVStore } from '@/types'
import type {
  Quest,
  QuestCategory,
  QuestChapter,
  QuestDifficulty,
  QuestMission,
  QuestStatus,
  MissionStatus,
} from '@/types/quests'

const V2_PREFIX = 'quests:v2'
const LIST_PAGE_LIMIT = 1000

const MAX_USER_ID_LENGTH = 200
const MAX_QUEST_ID_LENGTH = 120
const MAX_QUEST_TITLE_LENGTH = 80
const MAX_QUEST_DESCRIPTION_LENGTH = 400
const MAX_CHAPTER_TITLE_LENGTH = 60
const MAX_CHAPTER_DESCRIPTION_LENGTH = 200
const MAX_MISSION_ID_LENGTH = 120
const MAX_MISSION_TITLE_LENGTH = 80
const MAX_MISSION_DESCRIPTION_LENGTH = 200
const MAX_INDEX_SIZE = 20

// ─── Key builders ───────────────────────────────────────────────────────────────

export function buildQuestRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:record:${normalizeString(userId, MAX_USER_ID_LENGTH)}:`
}

export function buildQuestRecordKey(userId: string, questId: string): string {
  return `${buildQuestRecordPrefix(userId)}${normalizeString(questId, MAX_QUEST_ID_LENGTH)}`
}

export function buildQuestIndexKey(userId: string): string {
  return `${V2_PREFIX}:index:${normalizeString(userId, MAX_USER_ID_LENGTH)}`
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface QuestIndexRecord {
  questIds: string[]
  updatedAt: number
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

async function listKeysByPrefix(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  prefix: string,
): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) keys.push(entry.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

// ─── Normalization helpers ──────────────────────────────────────────────────────


function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeOptionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
}

function normalizeQuestStatus(value: unknown): QuestStatus | null {
  const s = normalizeString(value, 20)
  return s === 'active' || s === 'completed' || s === 'abandoned' || s === 'draft' ? s : null
}

function normalizeMissionStatus(value: unknown): MissionStatus | null {
  const s = normalizeString(value, 20)
  return s === 'locked' || s === 'available' || s === 'completed' ? s : null
}

function normalizeQuestDifficulty(value: unknown): QuestDifficulty | null {
  const s = normalizeString(value, 20)
  return s === 'easy' || s === 'medium' || s === 'hard' ? s : null
}

function normalizeQuestCategory(value: unknown): QuestCategory | null {
  const s = normalizeString(value, 20)
  const valid: QuestCategory[] = [
    'health',
    'learning',
    'creativity',
    'relationships',
    'career',
    'mindfulness',
    'other',
  ]
  return valid.includes(s as QuestCategory) ? (s as QuestCategory) : null
}

function normalizeMission(value: unknown): QuestMission | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, MAX_MISSION_ID_LENGTH)
  const title = normalizeString(value.title, MAX_MISSION_TITLE_LENGTH)
  const description = normalizeString(value.description, MAX_MISSION_DESCRIPTION_LENGTH)
  const status = normalizeMissionStatus(value.status)
  if (!id || !title || !description || !status) return null

  return {
    id,
    title,
    description,
    chapterNumber: normalizeInteger(value.chapterNumber),
    missionNumber: normalizeInteger(value.missionNumber),
    xpReward: normalizeInteger(value.xpReward),
    isBoss: Boolean(value.isBoss),
    status,
    completedAt: normalizeOptionalInteger(value.completedAt),
    unlockedAt: normalizeOptionalInteger(value.unlockedAt),
  }
}

function normalizeChapter(value: unknown): QuestChapter | null {
  if (!isRecord(value)) return null
  const title = normalizeString(value.title, MAX_CHAPTER_TITLE_LENGTH)
  const description = normalizeString(value.description, MAX_CHAPTER_DESCRIPTION_LENGTH)
  if (!title || !description) return null

  const rawMissions = Array.isArray(value.missions) ? value.missions : []
  const missions: QuestMission[] = []
  for (const m of rawMissions) {
    const normalized = normalizeMission(m)
    if (normalized) missions.push(normalized)
  }

  return {
    chapterNumber: normalizeInteger(value.chapterNumber),
    title,
    description,
    missions,
  }
}

export function normalizeQuestRecord(value: unknown, userId: string, questId: string): Quest | null {
  if (!isRecord(value)) return null

  const expectedUserId = normalizeString(userId, MAX_USER_ID_LENGTH)
  const expectedQuestId = normalizeString(questId, MAX_QUEST_ID_LENGTH)
  if (!expectedUserId || !expectedQuestId) return null

  const storedUserId = normalizeString(value.userId, MAX_USER_ID_LENGTH)
  const storedId = normalizeString(value.id, MAX_QUEST_ID_LENGTH)

  // Ownership and key integrity checks
  if (storedUserId && storedUserId !== expectedUserId) return null
  if (storedId && storedId !== expectedQuestId) return null

  const id = storedId || expectedQuestId
  const userIdNormalized = storedUserId || expectedUserId
  const title = normalizeString(value.title, MAX_QUEST_TITLE_LENGTH)
  const description = normalizeString(value.description, MAX_QUEST_DESCRIPTION_LENGTH)
  const status = normalizeQuestStatus(value.status)
  const category = normalizeQuestCategory(value.category)
  const difficulty = normalizeQuestDifficulty(value.difficulty)

  if (!id || !userIdNormalized || !title || !description || !status || !category || !difficulty) {
    return null
  }

  const rawChapters = Array.isArray(value.chapters) ? value.chapters : []
  const chapters: QuestChapter[] = []
  for (const c of rawChapters) {
    const normalized = normalizeChapter(c)
    if (normalized) chapters.push(normalized)
  }

  return {
    id,
    userId: userIdNormalized,
    title,
    description,
    goalNodeId: typeof value.goalNodeId === 'string' ? value.goalNodeId : null,
    category,
    difficulty,
    chapters,
    status,
    createdAt: normalizeInteger(value.createdAt),
    startedAt: normalizeOptionalInteger(value.startedAt),
    completedAt: normalizeOptionalInteger(value.completedAt),
    targetDurationDays: normalizeInteger(value.targetDurationDays),
    totalMissions: normalizeInteger(value.totalMissions),
    completedMissions: normalizeInteger(value.completedMissions),
    totalXPEarned: normalizeInteger(value.totalXPEarned),
    coverEmoji: normalizeString(value.coverEmoji, 10) || '🔮',
  }
}

function normalizeQuestIndexRecord(value: unknown): QuestIndexRecord | null {
  if (!isRecord(value)) return null
  const rawIds = Array.isArray(value.questIds) ? value.questIds : []
  const questIds: string[] = []
  const seen = new Set<string>()
  for (const id of rawIds) {
    const s = normalizeString(id, MAX_QUEST_ID_LENGTH)
    if (!s || seen.has(s)) continue
    seen.add(s)
    questIds.push(s)
    if (questIds.length >= MAX_INDEX_SIZE) break
  }
  return {
    questIds,
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

// ─── Low-level KV ───────────────────────────────────────────────────────────────

async function putJSON(kv: KVStore, key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
  await kv.put(key, JSON.stringify(value), options)
}

async function readJSON<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export async function getQuestRecord(kv: KVStore, userId: string, questId: string): Promise<Quest | null> {
  return normalizeQuestRecord(
    await readJSON<Quest>(kv, buildQuestRecordKey(userId, questId)),
    userId,
    questId,
  )
}

export async function putQuestRecord(kv: KVStore, userId: string, quest: Quest): Promise<Quest> {
  const normalized = normalizeQuestRecord(quest, userId, quest.id)
  if (!normalized) throw new Error(`Invalid Quest payload for ${quest.id}`)
  await putJSON(kv, buildQuestRecordKey(userId, quest.id), normalized)
  return normalized
}

export async function deleteQuestRecord(kv: KVStore, userId: string, questId: string): Promise<void> {
  await kv.delete(buildQuestRecordKey(userId, questId))
}

export async function getQuestIndex(kv: KVStore, userId: string): Promise<QuestIndexRecord | null> {
  return normalizeQuestIndexRecord(await readJSON<QuestIndexRecord>(kv, buildQuestIndexKey(userId)))
}

export async function saveQuestIndex(kv: KVStore, userId: string, index: QuestIndexRecord): Promise<void> {
  const normalized = normalizeQuestIndexRecord(index)
  if (!normalized) throw new Error(`Invalid QuestIndex payload for ${userId}`)
  await putJSON(kv, buildQuestIndexKey(userId), normalized)
}

export async function buildQuestSnapshot(kv: KVStore, userId: string): Promise<Quest[]> {
  const index = await getQuestIndex(kv, userId)
  const questIds = index?.questIds.length
    ? index.questIds
    : supportsList(kv)
      ? (await listKeysByPrefix(kv, buildQuestRecordPrefix(userId)))
        .map((key) => key.slice(buildQuestRecordPrefix(userId).length))
        .filter((questId) => questId.length > 0)
      : []

  if (questIds.length === 0) return []

  const records = await Promise.all(
    questIds.map((questId) => getQuestRecord(kv, userId, questId)),
  )

  return records.filter((record): record is Quest => record !== null)
}

// ─── Index helpers ────────────────────────────────────────────────────────────────

export async function addQuestToIndex(kv: KVStore, userId: string, questId: string): Promise<void> {
  const index = (await getQuestIndex(kv, userId)) ?? { questIds: [], updatedAt: 0 }
  if (!index.questIds.includes(questId)) {
    index.questIds.push(questId)
    index.updatedAt = Date.now()
    await saveQuestIndex(kv, userId, index)
  }
}

export async function removeQuestFromIndex(kv: KVStore, userId: string, questId: string): Promise<void> {
  const index = await getQuestIndex(kv, userId)
  if (!index) return
  const filtered = index.questIds.filter((id) => id !== questId)
  if (filtered.length !== index.questIds.length) {
    await saveQuestIndex(kv, userId, { questIds: filtered, updatedAt: Date.now() })
  }
}
