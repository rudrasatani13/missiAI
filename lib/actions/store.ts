import type { KVStore } from '@/types'

type CollectionName = 'reminders' | 'notes'

interface StoredActionBase {
  id: string
  createdAt: number
}

export interface StoredReminder extends StoredActionBase {
  task: string
  time: string
}

export interface StoredNote extends StoredActionBase {
  title: string
  content: string
}

const MAX_COLLECTION_ITEMS = 50
const LIST_PAGE_LIMIT = 1000

function legacyKey(collection: CollectionName, userId: string): string {
  return `actions:${collection}:${userId}`
}

function collectionPrefix(collection: CollectionName, userId: string): string {
  return `${legacyKey(collection, userId)}:`
}

function collectionItemKey(collection: CollectionName, userId: string, id: string): string {
  return `${collectionPrefix(collection, userId)}${id}`
}

function createItemId(prefix: 'rem' | 'note'): string {
  return `${Date.now().toString().padStart(13, '0')}_${prefix}_${crypto.randomUUID()}`
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

function normalizeItems<T extends StoredActionBase>(items: T[]): T[] {
  const deduped = new Map<string, T>()
  for (const item of items) {
    deduped.set(item.id, item)
  }
  return [...deduped.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_COLLECTION_ITEMS)
}

async function readLegacyItems<T extends StoredActionBase>(
  kv: KVStore,
  collection: CollectionName,
  userId: string,
): Promise<T[]> {
  try {
    const raw = await kv.get(legacyKey(collection, userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(Boolean) as T[] : []
  } catch {
    return []
  }
}

async function readIndexedEntries<T extends StoredActionBase>(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  collection: CollectionName,
  userId: string,
): Promise<Array<{ key: string; item: T }>> {
  const prefix = collectionPrefix(collection, userId)
  const keys: string[] = []
  let cursor: string | undefined

  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) {
      keys.push(entry.name)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const items = await Promise.all(
    keys.map(async (key) => {
      try {
        const raw = await kv.get(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as T
        if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') return null
        return { key, item: parsed }
      } catch {
        return null
      }
    }),
  )

  return items
    .filter((entry): entry is { key: string; item: T } => entry !== null)
    .sort((a, b) => b.item.createdAt - a.item.createdAt)
}

async function trimIndexedEntries<T extends StoredActionBase>(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  entries: Array<{ key: string; item: T }>,
): Promise<void> {
  const extras = entries.slice(MAX_COLLECTION_ITEMS)
  if (extras.length === 0) return
  await Promise.all(extras.map((entry) => kv.delete(entry.key).catch(() => {})))
}

async function appendLegacyItem<T extends StoredActionBase>(
  kv: KVStore,
  collection: CollectionName,
  userId: string,
  item: T,
): Promise<void> {
  const items = await readLegacyItems<T>(kv, collection, userId)
  items.unshift(item)
  await kv.put(legacyKey(collection, userId), JSON.stringify(normalizeItems(items)))
}

async function appendIndexedItem<T extends StoredActionBase>(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  collection: CollectionName,
  userId: string,
  item: T,
): Promise<void> {
  await kv.put(collectionItemKey(collection, userId, item.id), JSON.stringify(item))
  const entries = await readIndexedEntries<T>(kv, collection, userId)
  await trimIndexedEntries(kv, entries)
}

export async function addReminder(
  kv: KVStore,
  userId: string,
  input: { task: string; time: string },
): Promise<StoredReminder> {
  const reminder: StoredReminder = {
    id: createItemId('rem'),
    task: input.task,
    time: input.time,
    createdAt: Date.now(),
  }

  if (supportsList(kv)) {
    await appendIndexedItem(kv, 'reminders', userId, reminder)
  } else {
    await appendLegacyItem(kv, 'reminders', userId, reminder)
  }

  return reminder
}

export async function addNote(
  kv: KVStore,
  userId: string,
  input: { title: string; content: string },
): Promise<StoredNote> {
  const note: StoredNote = {
    id: createItemId('note'),
    title: input.title,
    content: input.content,
    createdAt: Date.now(),
  }

  if (supportsList(kv)) {
    await appendIndexedItem(kv, 'notes', userId, note)
  } else {
    await appendLegacyItem(kv, 'notes', userId, note)
  }

  return note
}

async function getCollectionItems<T extends StoredActionBase>(
  kv: KVStore,
  collection: CollectionName,
  userId: string,
): Promise<T[]> {
  const legacy = await readLegacyItems<T>(kv, collection, userId)
  if (!supportsList(kv)) {
    return normalizeItems(legacy)
  }

  const indexedEntries = await readIndexedEntries<T>(kv, collection, userId)
  const indexedItems = indexedEntries.map((entry) => entry.item)
  return normalizeItems([...indexedItems, ...legacy])
}

export async function getActionCollections(
  kv: KVStore,
  userId: string,
): Promise<{ reminders: StoredReminder[]; notes: StoredNote[] }> {
  const [reminders, notes] = await Promise.all([
    getCollectionItems<StoredReminder>(kv, 'reminders', userId),
    getCollectionItems<StoredNote>(kv, 'notes', userId),
  ])

  return { reminders, notes }
}
