import type { QuizSession } from '@/types/exam-buddy'


function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function getCryptoKey() {

  // Use the KV encryption secret as the root of trust, fallback for local dev
  const secret = process.env.MISSI_KV_ENCRYPTION_SECRET || 'missi-exam-buddy-local-session-v1'
  const secretBytes = new TextEncoder().encode(secret)
  const keyBytes = await crypto.subtle.digest('SHA-256', secretBytes)
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function createLocalSessionToken(session: QuizSession) {
  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(session))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

export async function readLocalSessionToken(token: string): Promise<QuizSession | null> {
  const [ivPart, dataPart] = token.split('.')
  if (!ivPart || !dataPart) return null

  try {
    const key = await getCryptoKey()
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(ivPart) },
      key,
      base64UrlToBytes(dataPart),
    )
    return JSON.parse(new TextDecoder().decode(decrypted)) as QuizSession
  } catch {
    return null
  }
}
