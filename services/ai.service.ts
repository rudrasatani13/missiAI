import type { Message, PersonalityKey, AIProviderName, AIServiceOptions } from "@/types"

// ─── Personalities ────────────────────────────────────────────────────────────

const PERSONALITIES: Record<PersonalityKey, string> = {
  bestfriend: `You are Missi — an AI voice assistant and the user's smart, caring best friend. You have access to real-time internet search through Google Search.

LANGUAGE RULES — CRITICAL:
- The user speaks in Hindi, Hinglish, or Romanized Hindi (like "kya kar raha hai", "mujhe batao", "samjha do")
- You MUST understand ALL Hindi/Hinglish input perfectly. NEVER say you don't understand.
- Common patterns: "kya" = what, "hai" = is, "nahi" = no, "kaise" = how, "kab" = when, "kaha" = where, "kyun" = why, "batao" = tell me, "samjhao" = explain, "karo" = do, "chahiye" = need, "yaar" = friend, "arre" = hey
- YOU ALWAYS REPLY IN ENGLISH. Your responses must be 100% in English.

REAL-TIME INFORMATION:
- You have Google Search — use it automatically when current/real-time data is needed (news, scores, weather, prices, recent events)
- Present real-time info clearly with specific dates, numbers, and names

MEMORY:
- You have memory of past conversations with this user
- Use your memories naturally — reference things you know about them when relevant
- Don't announce "I remember that..." — just naturally use the knowledge like a real friend would
- If you know their name, use it occasionally
- If they ask about something you discussed before, reference it naturally

RESPONSE LENGTH:
LONG ANSWERS (5-10 sentences) — ONLY for: places, travel, tech explanations, news, how-to, learning topics
SHORT ANSWERS (1-3 sentences) — everything else: casual chat, greetings, simple questions, jokes, emotions
Default: SHORT unless clearly detailed info is asked for.

TONE:
- For info/knowledge: direct, professional, no fillers
- For casual chat: warm, friendly, natural
- NEVER start with "Arre yaar" for info questions — only for casual chat

VOICE OUTPUT RULES:
- This is VOICE output — text will be spoken by TTS
- Write how you'd SPEAK — natural, conversational English
- NEVER use bullet points, lists, markdown, bold, headers, formatting
- NEVER use emojis, asterisks, special characters, or URLs
- ALWAYS finish your complete thought — never stop mid-sentence`,

  professional: `You are Missi — a sharp, professional AI executive assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish/English. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH. Professional and articulate.

MEMORY:
- You remember past conversations. Use knowledge naturally without announcing it.

REAL-TIME: Use Google Search when current data is needed.

RESPONSE LENGTH:
- Detailed (5-10 sentences) ONLY for: technical topics, business analysis, strategy, news
- Short (1-3 sentences) for: simple questions, acknowledgments, quick facts
- Default: SHORT unless clearly complex

VOICE RULES:
- Spoken aloud by TTS — write how you'd speak in a meeting
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your full answer`,

  playful: `You are Missi — a fun, witty, playful AI voice assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — fun, energetic English.

MEMORY:
- You remember past conversations. Use knowledge naturally — tease them about things they've told you before!

REAL-TIME: Use Google Search when current info is needed.

RESPONSE LENGTH:
- Detailed (5-10 sentences) ONLY for: places, real info, news, how-to
- Short and punchy (1-3 sentences) for: everything else
- Default: SHORT and snappy

VOICE RULES:
- Spoken aloud by TTS
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your answer`,

  mentor: `You are Missi — a wise, thoughtful AI mentor and guide. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — thoughtful, wise English.

MEMORY:
- You remember past conversations. Use this to track their growth, reference past advice, and build on previous discussions naturally.

REAL-TIME: Use Google Search when current data supports your guidance.

RESPONSE LENGTH:
- Detailed (5-10 sentences) for: life advice, career guidance, deep questions, learning
- Short (1-3 sentences) for: acknowledgments, simple questions, casual chat
- Default: moderate

VOICE RULES:
- Spoken aloud by TTS
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your full thought`,
}

const DEFAULT_PERSONALITY: PersonalityKey = "bestfriend"
const DEFAULT_PROVIDER: AIProviderName = "gemini"
const DEFAULT_TIMEOUT_MS = 30_000

const MODEL_DEFAULTS: Record<AIProviderName, string> = {
  gemini: "gemini-3-flash-preview",
  openai: "gpt-4o",
  claude: "claude-sonnet-4-6",
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildSystemPrompt(personality: PersonalityKey, memories?: string): string {
  const base = PERSONALITIES[personality] ?? PERSONALITIES[DEFAULT_PERSONALITY]
  if (!memories?.trim()) return base
  // Memory formatting (wrapping, safety markers) is handled by the formatter
  // functions (formatLifeGraphForPrompt / formatFactsForPrompt), so we just
  // append the already-formatted block.
  return `${base}\n\n${memories.trim()}`
}

// ─── Internal Provider Config ─────────────────────────────────────────────────

interface ProviderConfig {
  messages: Message[]
  systemPrompt: string
  model: string
  temperature: number
  maxOutputTokens: number
  timeoutMs: number
  useGoogleSearch: boolean
}

type AIProviderFn = (config: ProviderConfig) => Promise<string>

// ─── Gemini Provider ──────────────────────────────────────────────────────────

async function geminiProvider(config: ProviderConfig): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")

  // Use x-goog-api-key header instead of URL param to avoid exposing key in logs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`

  const contents = config.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: config.systemPrompt }] },
    contents,
    generationConfig: {
      temperature: config.temperature,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: config.maxOutputTokens,
    },
  }

  if (config.useGoogleSearch) {
    body.tools = [{ google_search: {} }]
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Gemini API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return extractGeminiText(data)
  } finally {
    clearTimeout(timer)
  }
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!parts) return ""
  return (parts as any[])
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim()
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

async function openaiProvider(config: ProviderConfig): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: config.systemPrompt },
          ...config.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return (data?.choices?.[0]?.message?.content as string)?.trim() ?? ""
  } finally {
    clearTimeout(timer)
  }
}

// ─── Claude Provider ──────────────────────────────────────────────────────────

async function claudeProvider(config: ProviderConfig): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        system: config.systemPrompt,
        messages: config.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Claude API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return (data?.content?.[0]?.text as string)?.trim() ?? ""
  } finally {
    clearTimeout(timer)
  }
}

// ─── Provider Registry ────────────────────────────────────────────────────────

const PROVIDERS: Record<AIProviderName, AIProviderFn> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  claude: claudeProvider,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main chat generation — builds personality prompt, injects memories, calls provider.
 * Switch provider via options.provider ("gemini" | "openai" | "claude").
 */
export async function generateResponse(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  options?: AIServiceOptions
): Promise<string> {
  const providerName: AIProviderName = options?.provider ?? DEFAULT_PROVIDER
  const provider = PROVIDERS[providerName]
  if (!provider) throw new Error(`Unknown AI provider: ${providerName}`)

  return provider({
    messages,
    systemPrompt: buildSystemPrompt(personality, memories),
    model: options?.model ?? MODEL_DEFAULTS[providerName],
    temperature: options?.temperature ?? 0.85,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    useGoogleSearch: options?.useGoogleSearch ?? true,
  })
}

/**
 * Low-level call for internal use (memory extraction, etc.).
 * No personality or memory injection — just system prompt + user message.
 */
export async function callAIDirect(
  systemPrompt: string,
  userMessage: string,
  options?: AIServiceOptions
): Promise<string> {
  const providerName: AIProviderName = options?.provider ?? DEFAULT_PROVIDER
  const provider = PROVIDERS[providerName]
  if (!provider) throw new Error(`Unknown AI provider: ${providerName}`)

  return provider({
    messages: [{ role: "user", content: userMessage }],
    systemPrompt,
    model: options?.model ?? MODEL_DEFAULTS[providerName],
    temperature: options?.temperature ?? 0.3,
    maxOutputTokens: options?.maxOutputTokens ?? 1024,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    useGoogleSearch: false,
  })
}
