/**
 * Edge-compatible Vertex AI OAuth Token Generator
 *
 * Generates OAuth2 access tokens from a Google Service Account JSON key
 * using the Web Crypto API (works on Edge runtimes: Cloudflare Workers,
 * Vercel Edge, Deno, browsers, and Node.js 20+).
 *
 * No dependency on google-auth-library or any Node.js-specific APIs.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ServiceAccountKey {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number // Unix ms
}

// ─── Token Cache ────────────────────────────────────────────────────────────────

let cachedToken: CachedToken | null = null
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // Refresh 5 min before expiry

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Base64url-encode a string (no padding). */
function base64url(input: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(input)
  return base64urlFromBytes(bytes)
}

/** Base64url-encode a Uint8Array (no padding). */
function base64urlFromBytes(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Parse a PEM-encoded PKCS#8 private key into a CryptoKey.
 * Google Service Account keys are in PKCS#8 format.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers/footers and whitespace
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "")

  // Decode base64 to ArrayBuffer
  const binaryStr = atob(pemBody)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

/**
 * Create a signed JWT for Google OAuth2 token exchange.
 */
async function createSignedJWT(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: serviceAccount.private_key_id,
  }

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600, // 1 hour
    scope: "https://www.googleapis.com/auth/cloud-platform",
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Import the private key and sign
  const key = await importPrivateKey(serviceAccount.private_key)
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  )

  const encodedSignature = base64urlFromBytes(new Uint8Array(signature))
  return `${signingInput}.${encodedSignature}`
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse the service account JSON from environment variables.
 * Supports both file path reference and inline JSON.
 */
export function getServiceAccountKey(): ServiceAccountKey | null {
  // Option 1: Inline JSON in env var (preferred for edge/serverless)
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (jsonStr) {
    try {
      return JSON.parse(jsonStr) as ServiceAccountKey
    } catch {
      console.error("[VertexAuth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON")
      return null
    }
  }

  return null
}

/**
 * Get a valid Vertex AI access token.
 * Caches the token and refreshes 5 minutes before expiry.
 * Returns null if no service account is configured.
 */
export async function getVertexAccessToken(): Promise<string | null> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.accessToken
  }

  const serviceAccount = getServiceAccountKey()
  if (!serviceAccount) {
    console.error("[VertexAuth] No service account configured")
    return null
  }

  try {
    // Create signed JWT
    const jwt = await createSignedJWT(serviceAccount)

    // Exchange JWT for access token
    const tokenUrl = serviceAccount.token_uri || "https://oauth2.googleapis.com/token"
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[VertexAuth] Token exchange failed ${res.status}: ${errText}`)
      return null
    }

    const data = await res.json()
    const accessToken = data.access_token as string
    const expiresIn = (data.expires_in as number) || 3600

    // Cache the token
    cachedToken = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    }

    console.log(`[VertexAuth] Token obtained, expires in ${expiresIn}s`)
    return accessToken
  } catch (err) {
    console.error("[VertexAuth] Failed to obtain access token:", err)
    return null
  }
}

/**
 * Get the Vertex AI project ID from environment.
 */
export function getVertexProjectId(): string {
  return process.env.VERTEX_AI_PROJECT_ID || ""
}

/**
 * Get the Vertex AI location from environment.
 */
export function getVertexLocation(): string {
  return process.env.VERTEX_AI_LOCATION || "us-central1"
}

/**
 * Check if the AI backend is configured to use Vertex AI.
 */
export function isVertexAI(): boolean {
  return (process.env.AI_BACKEND || "google-ai") === "vertex"
}
