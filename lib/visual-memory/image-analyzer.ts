// ─── Visual Memory — Image Analyzer ──────────────────────────────────────────
//
// Sends an image to Gemini Vision and extracts structured memory data.
//
// SECURITY NOTES:
// - Images are NEVER stored — bytes exist only in memory during this function call.
// - Images are sent as inline base64 data — never as URLs or via file upload API.
// - All Gemini output is sanitized before being returned to the caller.
// - The entire function is wrapped in try/catch with a safe fallback.

import type { VisualExtraction, VisualMemoryCategory } from '@/types/visual-memory'
import type { MemoryCategory } from '@/types/memory'
import type { LifeNode } from '@/types/memory'
import { geminiGenerate } from '@/lib/ai/vertex-client'

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-pro'
const ANALYSIS_TIMEOUT_MS = 60_000

// Valid visual categories for validation
const VALID_CATEGORIES = new Set<VisualMemoryCategory>([
  'food', 'product', 'contact', 'event', 'document',
  'place', 'receipt', 'inspiration', 'general',
])

// ─── Prompt Injection Sanitization ───────────────────────────────────────────
//
// Security Rule 7: All strings returned from Gemini must be sanitized before
// storing as LifeNodes. Strips prompt-injection patterns, truncates to max
// field lengths, discards if >50% stripped.

const PROMPT_INJECTION_REGEX =
  /\[.*?\]|\<\|.*?\|\>|ignore\s*(all\s*)?previous\s*(instructions)?|you are missi|system:/gi

function sanitizeGeminiOutput(input: string, maxLength: number): string {
  if (!input || typeof input !== 'string') return ''

  const original = input
  let cleaned = input
    .replace(PROMPT_INJECTION_REGEX, '')
    .replace(/\[INST\]/gi, '')
    .replace(/\[LIFE GRAPH/gi, '')
    .replace(/\[END/gi, '')
    .replace(/IGNORE PREVIOUS/gi, '')
    .replace(/You are/gi, '')
    .replace(/<\|system\|>/gi, '')
    // Strip HTML tags
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, maxLength)

  // Security: if sanitization stripped >50% of content, it's suspicious
  if (original.length > 20 && cleaned.length < original.length * 0.5) {
    return ''
  }

  return cleaned
}

// ─── Safe Fallback ────────────────────────────────────────────────────────────

function safeFallback(reason: string = 'Image content could not be fully analyzed'): VisualExtraction {
  // Only log to server — never expose raw reason to users
  console.error('[VisualMemory] Fallback triggered:', reason)
  return {
    category: 'general',
    title: 'Saved visual memory',
    detail: 'Image content could not be fully analyzed. Please try uploading again.',
    structuredData: null,
    tags: [],
    people: [],
    emotionalWeight: 0.3,
    recallHint: 'What did I save from that image?',
  }
}

// ─── Gemini Prompt ────────────────────────────────────────────────────────────

function buildAnalysisPrompt(userNote: string | null): string {
  // Security Rule 6: userNote has been sanitized by the caller before reaching here.
  const noteContext = userNote
    ? `\n\nThe user added this note about the image: "${userNote}". Use this context to improve your extraction.`
    : ''

  return `You are a world-class visual memory engine. Your mission is to extract EVERY SINGLE piece of information from this image so the user can recall ANY detail later — no matter how small. Respond ONLY with a valid JSON object. No markdown, no code blocks, no explanation text.

═══ UNIVERSAL EXTRACTION RULES ═══
1. Extract ALL visible text verbatim — every word, number, label, header, footer, watermark, fine print.
2. Describe ALL visual elements — people, objects, colors, brands, logos, backgrounds, lighting, mood.
3. NEVER summarize, abbreviate, or skip anything. NEVER say "etc", "and more", "various", or "several".
4. If you can see it, it MUST appear in your output. Missing even one detail is a failure.
5. For numbers: transcribe EXACTLY as shown. Do not round, estimate, or confuse columns.

═══ CATEGORY-SPECIFIC DEEP EXTRACTION ═══

📄 DOCUMENTS (marksheets, certificates, IDs, forms, licenses, passports):
→ Extract: Student/holder name, father/mother name, date of birth, roll/seat/SID/center number, institution name, board/university, exam date/month/year, EVERY subject with ALL sub-scores (internal, external, practical, total, grade), overall percentage, percentile rank, result status (pass/fail/distinction), serial number, stamp text, signatures, QR code text if readable, issuing authority, watermark text.

🧾 RECEIPTS & INVOICES:
→ Extract: Store/company name, address, phone, GST/tax ID, date, time, invoice number, cashier name, EVERY line item (name, quantity, unit price, total), subtotal, each tax line, discount, grand total, payment method, card last 4 digits, transaction ID, barcode numbers.

📱 SCREENSHOTS (apps, chats, social media, settings, errors):
→ Extract: App name, username/handle, timestamp, EVERY message/post verbatim, likes/retweets/views counts, comment text, notification text, error messages with codes, URL if visible, UI labels, status bar info (time, battery, signal).

📝 HANDWRITTEN NOTES & WHITEBOARDS:
→ Extract: ALL handwritten text (even if messy — do your best), diagrams described in words, arrows/connections explained, highlighted or underlined items noted, colors used, page numbers, headers.

🍔 FOOD & DRINKS:
→ Extract: Dish names, visible ingredients, cuisine type, restaurant name/logo if visible, menu items and prices, portion size estimate, presentation style, drinks (brand, type), background setting (restaurant/home/outdoor).

👤 SELFIES & GROUP PHOTOS:
→ Extract: Number of people, approximate ages, gender, clothing description, accessories (glasses, watches, jewelry), facial expressions/mood, hairstyles, setting (indoor/outdoor/event), background details (location clues, signs, landmarks), occasion (party, graduation, casual).

🏔️ TRAVEL & SCENERY:
→ Extract: Location clues (signs, landmarks, language on signs), type of place (beach, mountain, city, temple, monument), weather/time of day, notable architecture, flora/fauna, vehicles, crowd level, any text on signs/boards.

🛍️ PRODUCTS & SHOPPING:
→ Extract: Brand name, product name, model number, price, currency, color, size, material, condition (new/used), store name, barcode/SKU if visible, packaging details, specs on label.

💊 MEDICATION & HEALTH:
→ Extract: Drug name (brand + generic), dosage, form (tablet/syrup/injection), manufacturer, batch number, expiry date, MRP, instructions, warnings, composition/ingredients, storage instructions.

📊 CHARTS, GRAPHS & DATA:
→ Extract: Chart title, axis labels, ALL data points/values, legend entries, trend description, units, source citation, time period covered.

💻 CODE & TECHNICAL:
→ Extract: Programming language, ALL code verbatim, file names, error messages, line numbers, function names, comments, terminal output, IDE name.

📇 BUSINESS CARDS & CONTACTS:
→ Extract: Full name, title/designation, company, phone (all numbers), email, website, address, social handles, logo description.

🗺️ MAPS & DIRECTIONS:
→ Extract: Location names, street names, distance, estimated time, route highlights, pins/markers, transit info.

🎨 ART, MEMES & INSPIRATION:
→ Extract: ALL text (top text, bottom text, watermarks), describe the visual content, art style, artist signature if visible, platform watermark (Instagram, Pinterest, etc).

🚗 VEHICLES:
→ Extract: Make, model, year estimate, color, license plate number, condition, modifications, location.

📦 PACKAGES & SHIPPING:
→ Extract: Tracking number, sender, recipient, address, weight, dimensions, courier name, delivery date, barcode text.

🏠 REAL ESTATE & INTERIORS:
→ Extract: Room type, furniture items, dimensions if shown, condition, style, brand names visible, price if listed, address.

The JSON must match this exact shape:
{
  "category": one of ["food", "product", "contact", "event", "document", "place", "receipt", "inspiration", "general"],
  "title": "short descriptive title, max 80 chars",
  "detail": "EXHAUSTIVE extraction of ALL visible information. Transcribe every piece of text, describe every visual element. For tables, list every row. For documents, list every field. Leave NOTHING out. (max 6000 chars)",
  "structuredData": "All specific data points organized with clear labels: IDs, numbers, dates, scores, grades, prices, addresses, phone numbers, measurements. One item per line. (max 4000 chars)",
  "tags": ["array", "of", "relevant", "tags", "max 8"],
  "people": ["full names of any people mentioned or visible"],
  "emotionalWeight": number between 0 and 1,
  "recallHint": "example question the user might ask about this image later"
}${noteContext}

REMEMBER: The user WILL ask you about the tiniest detail from this image months later. If you skip even ONE number, ONE name, or ONE label, you have FAILED your mission. Be obsessively thorough.`
}

// ─── Response Validation ──────────────────────────────────────────────────────

function validateExtraction(raw: unknown): VisualExtraction | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  // Provide defaults for arrays if missing
  const rawTags = Array.isArray(obj.tags) ? obj.tags : []
  const rawPeople = Array.isArray(obj.people) ? obj.people : []

  // Default emotional weight if not a number
  let ew = 0.5
  if (typeof obj.emotionalWeight === 'number') {
    ew = obj.emotionalWeight
  } else if (typeof obj.emotionalWeight === 'string' && !isNaN(Number(obj.emotionalWeight))) {
    ew = Number(obj.emotionalWeight)
  }

  // Provide defaults for strings if they are missing
  const rawTitle = typeof obj.title === 'string' ? obj.title : 'Extracted Image'
  const rawDetail = typeof obj.detail === 'string' ? obj.detail : 'No details extracted.'
  const rawHint = typeof obj.recallHint === 'string' ? obj.recallHint : 'What did I save from that image?'

  // Sanitize all string outputs (Security Rule 7)
  const title = sanitizeGeminiOutput(rawTitle, 80) || 'Saved visual memory'
  const detail = sanitizeGeminiOutput(rawDetail, 6000) || 'Extracted details omitted.'
  const recallHint = sanitizeGeminiOutput(rawHint, 200) || 'What did I save from that image?'
  
  const structuredDataRaw = obj.structuredData
  const structuredData =
    structuredDataRaw === null || structuredDataRaw === undefined
      ? null
      : sanitizeGeminiOutput(String(structuredDataRaw), 4000) || null

  if (!title || !detail) return null

  const tags = rawTags
    .filter((t) => typeof t === 'string')
    .map((t) => sanitizeGeminiOutput(t as string, 50))
    .filter(Boolean)
    .slice(0, 8)

  const people = rawPeople
    .filter((p) => typeof p === 'string')
    .map((p) => sanitizeGeminiOutput(p as string, 80))
    .filter(Boolean)

  const emotionalWeight = Math.max(0, Math.min(1, ew))

  let cat = obj.category as VisualMemoryCategory
  if (!VALID_CATEGORIES.has(cat)) {
    cat = 'general'
  }

  return {
    category: cat,
    title,
    detail,
    structuredData,
    tags,
    people,
    emotionalWeight,
    recallHint: recallHint || 'What did I save from that image?',
  }
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

/**
 * Sends an image to Gemini Vision and returns structured extraction.
 *
 * SECURITY: imageBytes exist only in memory during this call — never written
 * to any persistent store. Sent to Gemini as inline base64 data only.
 *
 * @param imageBytes - Raw image bytes (in memory only — never persisted)
 * @param mimeType   - Validated MIME type of the image
 * @param userNote   - Optional sanitized user note (max 200 chars, HTML-stripped)
 * @param _geminiApiKey - Kept for backward compat; auth is via vertex-client
 */
export async function analyzeImageWithGemini(
  imageBytes: Uint8Array,
  mimeType: string,
  userNote: string | null,
  _geminiApiKey: string,
): Promise<VisualExtraction> {
  try {
    // Convert bytes to base64 completely safely for Edge JS
    const CHUNK_SIZE = 32768
    const chunks: string[] = []
    for (let i = 0; i < imageBytes.length; i += CHUNK_SIZE) {
      const chunk = imageBytes.subarray(i, i + CHUNK_SIZE)
      chunks.push(String.fromCharCode.apply(null, Array.from(chunk)))
    }
    const base64 = btoa(chunks.join(''))

    const prompt = buildAnalysisPrompt(userNote)

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            // Security Rule 4: image sent as inline base64 — never as URL
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }

    // Race against 10-second timeout — vision analysis can be slow
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini vision timeout')), ANALYSIS_TIMEOUT_MS),
    )

    const fetchPromise = geminiGenerate(GEMINI_MODEL, requestBody)
    const res = await Promise.race([fetchPromise, timeoutPromise])

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[VisualMemory] Gemini returned ${res.status}: ${errText}`)
      // Truncate errText to fit clearly in UI, but keep the core message
      return safeFallback(`Gemini API error ${res.status}`)
    }

    const data = await res.json()
    const rawText: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!rawText) return safeFallback('No text returned from Gemini API')

    // Extract JSON from markdown if present
    let jsonText = rawText.trim()
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (match) {
      jsonText = match[1].trim()
    } else {
      // In case Gemini added text before the first '{'
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.warn('[VisualMemory] Gemini returned malformed JSON — using fallback')
      return safeFallback('Malformed response from vision model')
    }

    const validated = validateExtraction(parsed)
    if (!validated) {
      console.warn('[VisualMemory] Gemini extraction failed validation — using fallback')
      return safeFallback('JSON failed strict schema validation')
    }

    return validated
  } catch (err: any) {
    console.error('[VisualMemory] analyzeImageWithGemini error:', err)
    return safeFallback('Vision analysis failed')
  }
}

// ─── Category Mapping ─────────────────────────────────────────────────────────

/**
 * Maps VisualMemoryCategory to MemoryCategory for LifeNode storage.
 *
 * Mapping rationale:
 * - food       → preference (dietary preferences, restaurant choices)
 * - product    → preference (things the user likes / wants to buy)
 * - contact    → person    (people data — closest semantic match)
 * - event      → event     (direct match)
 * - document   → skill     (knowledge content from docs/notes)
 * - place      → place     (direct match)
 * - receipt    → event     (timestamped transaction — event-like)
 * - inspiration → belief   (values, ideas, motivation)
 * - general    → preference (catch-all)
 */
const CATEGORY_MAP: Record<VisualMemoryCategory, MemoryCategory> = {
  food:        'preference',
  product:     'preference',
  contact:     'person',
  event:       'event',
  document:    'skill',
  place:       'place',
  receipt:     'event',
  inspiration: 'belief',
  general:     'preference',
}

/**
 * Maps a VisualExtraction to the LifeNode input format for addOrUpdateNode.
 * Sets source to 'visual' so the memory graph can identify visual memories.
 */
export function mapExtractionToLifeNode(
  extraction: VisualExtraction,
  userId: string,
): Omit<LifeNode, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'> {
  // Combine detail and structuredData into the node's detail field
  const detail = extraction.structuredData
    ? `${extraction.detail} | Data: ${extraction.structuredData}`.slice(0, 8000)
    : extraction.detail.slice(0, 8000)

  return {
    userId,
    category: CATEGORY_MAP[extraction.category],
    title: extraction.title.slice(0, 80),
    detail,
    tags: extraction.tags.slice(0, 8),
    people: extraction.people,
    emotionalWeight: extraction.emotionalWeight,
    confidence: 0.85, // Gemini vision extraction is fairly reliable
    source: 'visual',  // Security Rule 8: marks this as visual-origin memory
  }
}
