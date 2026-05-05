/**
 * Contact Store — KV-based contact name→email resolution
 *
 * Stores contacts per user in KV to resolve
 * names like "Rahul" to email addresses for sending emails.
 */

import type { KVStore } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Contact {
  name: string
  email: string
  phone?: string
  relation?: string
  addedAt: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONTACTS = 200
const KV_PREFIX = "contacts"

function kvKey(userId: string): string {
  return `${KV_PREFIX}:${userId}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getContacts(kv: KVStore, userId: string): Promise<Contact[]> {
  try {
    const raw = await kv.get(kvKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as Contact[]
  } catch {
    return []
  }
}

export async function lookupContact(
  kv: KVStore,
  userId: string,
  nameQuery: string,
): Promise<Contact | null> {
  const contacts = await getContacts(kv, userId)
  const q = nameQuery.toLowerCase().trim()

  // Exact match first
  const exact = contacts.find(c => c.name.toLowerCase() === q)
  if (exact) return exact

  // Partial match (starts with)
  const partial = contacts.find(c => c.name.toLowerCase().startsWith(q))
  if (partial) return partial

  // Fuzzy match (contains)
  const fuzzy = contacts.find(c => c.name.toLowerCase().includes(q))
  return fuzzy ?? null
}

export async function saveContact(
  kv: KVStore,
  userId: string,
  contact: Omit<Contact, "addedAt">,
): Promise<Contact> {
  const contacts = await getContacts(kv, userId)

  const newContact: Contact = {
    ...contact,
    name: contact.name.trim().slice(0, 100),
    email: contact.email.trim().slice(0, 200),
    phone: contact.phone?.trim().slice(0, 20),
    relation: contact.relation?.trim().slice(0, 50),
    addedAt: Date.now(),
  }

  // Update if same name exists
  const existingIdx = contacts.findIndex(
    c => c.name.toLowerCase() === newContact.name.toLowerCase(),
  )
  if (existingIdx >= 0) {
    contacts[existingIdx] = newContact
  } else {
    contacts.push(newContact)
  }

  // Cap contacts
  const trimmed = contacts.slice(-MAX_CONTACTS)
  await kv.put(kvKey(userId), JSON.stringify(trimmed))

  return newContact
}
