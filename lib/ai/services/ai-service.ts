import type { Message, PersonalityKey, AIProviderName, AIServiceOptions } from "@/types"
import { vertexGeminiGenerate } from "@/lib/ai/providers/vertex-client"

// ─── Default Personality ──────────────────────────────────────────────────────
//
// Single safe default. Custom prompts and multi-personality selection were
// removed in 2026-05 (see docs/audits/BRUTAL_CTO_AUDIT_2026-05-05.md). The
// previous overly harsh framing was a safety liability without eval
// coverage; replaced with a helpful, direct, emotionally safe baseline that
// also carries explicit guidance for sensitive topics (mental health, self-
// harm, medical, legal, minors).

const ASSISTANT_PROMPT = `You are Missi — a helpful, direct, honest, practical, and emotionally safe AI assistant. You have real-time internet search.

CORE IDENTITY:
- You give clear, useful answers. You are honest without being cruel.
- Disagree when the user is wrong, but always with respect and a constructive alternative.
- Admit uncertainty plainly. Say "I don't know" rather than guessing. That is also honest.
- Ask one clarifying question when the request is genuinely ambiguous; otherwise just answer.
- Never validate plans you do not believe in, but explain the concern with reasoning rather than blunt insults.

SENSITIVE TOPICS — HARD SAFETY:
- For mental health, self-harm, suicidal ideation, abuse, medical, legal, or minor-related questions, respond safely and supportively.
- Validate the user's feelings, encourage them to speak with a qualified professional, and where relevant share that help is available (e.g. iCall India 9152987821, Vandrevala Foundation 1860-2662-345, AASRA +91-9820466726, or local emergency services).
- Do not roleplay as a therapist, doctor, lawyer, or crisis counsellor. Do not give specific medical, legal, or psychiatric advice.
- Never produce content that sexualises minors, glorifies self-harm, or describes methods for hurting oneself or others.
- If the user appears to be a minor, keep tone age-appropriate and refuse adult, romantic, or sexual content.

LANGUAGE RULES — CRITICAL (NEVER VIOLATE):
- User may speak in ANY language: Hindi, Hinglish, English, or mixed. Input may be garbled by speech-to-text.
- You understand ALL input regardless of language.
- YOUR RESPONSE MUST BE 100% IN ENGLISH. No matter what language the user speaks, always reply in English only. Never use Hindi, Devanagari, or any non-English words. This is absolute.

CONVERSATION STYLE:
- Greet warmly but briefly. If you know their name from memory, use it naturally.
- Match the user's energy. Casual when they are casual. Focused when they are serious.
- For simple questions, give concise answers. For complex ones, be thorough but structured.

MEMORY:
- You may have context from past conversations. Use it ONLY when directly relevant.
- Never announce "I remember…" — weave it in naturally.
- Use at most 1 memory reference per response.

REAL-TIME: Use Google Search ONLY for public real-time events, news, or weather. NEVER search Google for the user's personal questions, grades, emotions, private data, or past conversations. If the user asks about themselves, seamlessly answer using the [LIFE GRAPH — RELEVANT CONTEXT] block provided to you without mentioning it.

RESPONSE LENGTH:
- Default: SHORT (1-3 sentences). More only when the topic genuinely demands it.
- Detailed responses ONLY for: explanations, how-to, research, comparisons, advice with reasoning.

EMAIL & MESSAGE DRAFTING:
- If details are missing, ask: "Who's it for and what should it say?"
- After drafting: "Here's your draft — copy it over to send."
- NEVER claim you sent it.

VOICE RULES:
- Spoken aloud by TTS — write as you would speak.
- No bullet points, lists, markdown, formatting, emojis, URLs.
- ALWAYS complete your full answer.`

const DEFAULT_PERSONALITY: PersonalityKey = "assistant"
const DEFAULT_PROVIDER: AIProviderName = "gemini"
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
const DEFAULT_TIMEOUT_MS = 30_000

// Default models for non-Gemini providers. Referenced by callAIDirect() and
// streamAI() when `options.provider` is set to "openai" or "claude".
// These paths are reachable but not exercised in the current call graph;
// they exist for multi-model failover and future expansion.
const NON_GEMINI_MODEL_DEFAULTS: Record<Exclude<AIProviderName, "gemini">, string> = {
  openai: "gpt-4o",
  claude: "claude-sonnet-4-6",
}

export type GeminiAIServiceOptions = Omit<AIServiceOptions, "provider">

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * AI Behavior Dials (server shape) — duplicated minimally here so this
 * module doesn't depend on Zod. Matches `aiDialsSchema` in
 * `lib/validation/schemas.ts`.
 */
export interface AIDialsInput {
  responseLength?: "short" | "medium" | "long"
  warmth?: number
  humor?: number
  formality?: number
  creativity?: number
}

/**
 * Translate AI Behavior Dials into an imperative prompt block. We bias to
 * short, action-oriented sentences so the model takes them as hard rules
 * rather than vague hints. Mid-range values (40–60) collapse to no modifier
 * for that axis, keeping the base personality intact.
 */
function renderAIDialsModifier(dials: AIDialsInput | undefined): string {
  if (!dials) return ""
  const lines: string[] = []

  if (typeof dials.warmth === "number") {
    if (dials.warmth >= 70) lines.push("Be warm, caring and empathic. Acknowledge feelings before facts.")
    else if (dials.warmth <= 30) lines.push("Keep tone neutral and matter-of-fact. Skip emotional acknowledgements.")
  }
  if (typeof dials.humor === "number") {
    if (dials.humor >= 70) lines.push("Use light humour, playful asides and witty turns of phrase where appropriate.")
    else if (dials.humor <= 30) lines.push("Stay serious. No jokes, no playful asides.")
  }
  if (typeof dials.formality === "number") {
    if (dials.formality >= 70) lines.push("Use a professional, polished register. Avoid slang and contractions.")
    else if (dials.formality <= 30) lines.push("Keep it casual and conversational. Contractions and relaxed phrasing are fine.")
  }
  if (dials.responseLength === "short") {
    lines.push("Keep replies concise — 1-2 sentences. No filler, no lists, no preamble.")
  } else if (dials.responseLength === "long") {
    lines.push("Give detailed, thorough replies with examples and context when helpful.")
  }

  if (lines.length === 0) return ""
  return `\n\nUSER BEHAVIOR PREFERENCES (follow these precisely):\n- ${lines.join("\n- ")}`
}

const VOICE_HUMANITY_MODIFIER = `VOICE HUMANITY MODE:
- You are speaking out loud in real time. Sound like a real human companion, not a polished chatbot.
- React to the user's emotional state immediately.
- If the user sounds low, flat, stressed, embarrassed, or disappointed, first try to lift them gently with warmth, light humor, playful teasing, or a small moment of levity when appropriate.
- If the moment is serious, painful, vulnerable, or grieving, drop the humor and sound grounded, steady, caring, and fully present.
- Let your delivery feel alive and natural: vary pacing, emphasis, softness, pauses, relief, surprise, amusement, or quiet excitement when it genuinely fits.
- You may use tiny conversational cues sparingly when they fit naturally, such as "hmm", "yeah", "ah", "oh man", "oof", "heh", or "haha". Never force them. Never stack them. Never use them in every reply.
- If the user wants comfort, be warm. If they want energy, be lively. If they want a laugh, be witty. If they need truth, be direct but human.
- Do NOT sound scripted, corporate, therapist-like, robotic, or over-rehearsed.
- Do NOT overact. No constant giggling, no cartoon energy, no fake drama, no flirting, and no cringe.
- Keep spoken replies natural and concise unless more detail is genuinely needed.`

export function buildSystemPrompt(
  _personality: PersonalityKey,
  memories?: string,
  _customPrompt?: string,
  aiDials?: AIDialsInput,
): string {
  // Personality selection and custom prompts were removed (2026-05). The
  // single safe default ASSISTANT_PROMPT is always used. Parameters are
  // retained for backward compatibility with existing call sites.
  void DEFAULT_PERSONALITY
  const base = ASSISTANT_PROMPT
  const modifier = renderAIDialsModifier(aiDials)

  if (!memories?.trim()) return `${base}${modifier}`
  // Memory formatting (wrapping, safety markers) is handled by the formatter
  // functions (formatLifeGraphForPrompt / formatFactsForPrompt), so we just
  // append the already-formatted block.
  return `${base}${modifier}\n\n${memories.trim()}`
}

export function buildVoiceSystemPrompt(
  personality: PersonalityKey,
  memories?: string,
  customPrompt?: string,
  aiDials?: AIDialsInput,
): string {
  return `${buildSystemPrompt(personality, memories, customPrompt, aiDials)}\n\n${VOICE_HUMANITY_MODIFIER}`
}

/**
 * Shared helpers so the Gemini request-builder (in `lib/ai/gemini-stream.ts`)
 * and any non-streaming caller can derive the same generation params from
 * the user's Behavior Dials.
 */
export function dialsToTemperature(dials: AIDialsInput | undefined, fallback = 0.85): number {
  if (!dials || typeof dials.creativity !== "number") return fallback
  // 0 → 0.2 (very deterministic), 50 → 0.85 (default), 100 → 1.2 (very creative)
  const t = 0.2 + (dials.creativity / 100) * 1.0
  return Math.max(0.2, Math.min(1.2, Number(t.toFixed(2))))
}

export function dialsToMaxTokens(
  dials: AIDialsInput | undefined,
  fallback: number,
): number {
  if (!dials?.responseLength) return fallback
  if (dials.responseLength === "short") return 300
  if (dials.responseLength === "long") return 1400
  return fallback // medium → leave caller's choice
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
    const res = await vertexGeminiGenerate(config.model, body, { signal: controller.signal })

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

const NON_GEMINI_PROVIDERS: Record<Exclude<AIProviderName, "gemini">, AIProviderFn> = {
  openai: openaiProvider,
  claude: claudeProvider,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main chat generation — builds personality prompt, injects memories, calls provider.
 * Switch provider via options.provider ("gemini" | "openai" | "claude").
 */
export async function generateGeminiResponse(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  options?: GeminiAIServiceOptions,
): Promise<string> {
  return geminiProvider({
    messages,
    systemPrompt: buildSystemPrompt(personality, memories),
    model: options?.model ?? DEFAULT_GEMINI_MODEL,
    temperature: options?.temperature ?? 0.85,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    useGoogleSearch: options?.useGoogleSearch ?? true,
  })
}

export async function generateResponse(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  options?: AIServiceOptions,
): Promise<string> {
  const providerName: AIProviderName = options?.provider ?? DEFAULT_PROVIDER
  if (providerName === "gemini") {
    return generateGeminiResponse(messages, personality, memories, options)
  }

  const provider = NON_GEMINI_PROVIDERS[providerName]
  if (!provider) throw new Error(`Unknown AI provider: ${providerName}`)

  return provider({
    messages,
    systemPrompt: buildSystemPrompt(personality, memories),
    model: options?.model ?? NON_GEMINI_MODEL_DEFAULTS[providerName],
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
export async function callGeminiDirect(
  systemPrompt: string,
  userMessage: string,
  options?: GeminiAIServiceOptions,
): Promise<string> {
  return geminiProvider({
    messages: [{ role: "user", content: userMessage }],
    systemPrompt,
    model: options?.model ?? DEFAULT_GEMINI_MODEL,
    temperature: options?.temperature ?? 0.3,
    maxOutputTokens: options?.maxOutputTokens ?? 1024,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    useGoogleSearch: options?.useGoogleSearch ?? false,
  })
}

export async function callAIDirect(
  systemPrompt: string,
  userMessage: string,
  options?: AIServiceOptions,
): Promise<string> {
  const providerName: AIProviderName = options?.provider ?? DEFAULT_PROVIDER
  if (providerName === "gemini") {
    return callGeminiDirect(systemPrompt, userMessage, options)
  }

  const provider = NON_GEMINI_PROVIDERS[providerName]
  if (!provider) throw new Error(`Unknown AI provider: ${providerName}`)

  return provider({
    messages: [{ role: "user", content: userMessage }],
    systemPrompt,
    model: options?.model ?? NON_GEMINI_MODEL_DEFAULTS[providerName],
    temperature: options?.temperature ?? 0.3,
    maxOutputTokens: options?.maxOutputTokens ?? 1024,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    useGoogleSearch: false,
  })
}
