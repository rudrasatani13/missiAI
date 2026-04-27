// ─── Exam Buddy Quiz Generator ────────────────────────────────────────────────

import { z } from 'zod'
import { nanoid } from 'nanoid'
import { callGeminiDirect } from '@/lib/ai/services/ai-service'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import type {
  ExamTarget,
  ExamSubject,
  QuizDifficulty,
  QuizQuestion,
  QuizQuestionType,
} from '@/types/exam-buddy'

const MAX_QUESTIONS = 20
const GENERATION_TIMEOUT_MS = 45_000
const MAX_OPTION_LEN = 300
const MAX_QUESTION_LEN = 1000
const MAX_EXPLANATION_LEN = 800

// ─── Result Types ─────────────────────────────────────────────────────────────

export type QuizGenerationFailureReason =
  | 'invalid_input'
  | 'provider_error'
  | 'timeout'
  | 'unparseable_response'
  | 'empty_response'
  | 'no_valid_questions'

export interface QuizGenerationResult {
  questions: QuizQuestion[]
  reason?: QuizGenerationFailureReason
  detail?: string
}

// ─── Input Validation ─────────────────────────────────────────────────────────

const generateQuizInputSchema = z.object({
  subject: z.string().min(1).max(50),
  topic: z.string().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  questionCount: z.number().int().min(1).max(MAX_QUESTIONS),
  examTarget: z.string().min(1).max(50),
  questionTypes: z.array(z.enum(['mcq', 'true_false', 'numerical'])).min(1),
})

// ─── HTML Stripping ───────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

function sanitizeField(value: string, maxLen: number): string {
  return sanitizeMemories(stripHtml(value)).slice(0, maxLen)
}

// ─── System & User Prompts ────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return String.raw`You are an expert Indian competitive exam question generator. Generate quiz questions as a valid JSON array.

STRICT RULES:
- Output ONLY a raw JSON array. No markdown, no code fences, no commentary before or after.
- Every question object must have these exact keys: id (empty string), questionText, options (array), correctAnswer, explanation, difficulty, subject, topic, type.
- For MCQ: exactly 4 options, and correctAnswer must match one of the options word-for-word.
- For true_false: options must be ["True", "False"], correctAnswer must be "True" or "False".
- For numerical: options must be [], correctAnswer is the numeric string.
- Write explanations in clear, simple English only.
- All content must be factually accurate for the specified exam.
- Never include HTML tags or markdown formatting.

MATH NOTATION:
- For ALL mathematical expressions, equations, matrices, fractions, exponents, integrals, symbols, and formulas: use LaTeX notation wrapped in dollar signs.
- Inline math: $expression$ (e.g. $F = ma$, $x^2 + y^2 = r^2$, $\\frac{a}{b}$).
- Display math for complex expressions: $$expression$$ (e.g. $$\\int_0^1 x^2 dx$$).
- Matrices: use $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$ notation.
- Greek letters: $\\alpha$, $\\beta$, $\\theta$, etc.
- Subscripts/superscripts: $A^{-1}$, $x_n$, $a_{ij}$.
- This applies to questionText, options, correctAnswer, and explanation fields.
- NEVER write plain-text math like "A = [[2,3],[4,5]]" — always use LaTeX.
- Because the output must be valid JSON, every LaTeX backslash inside a JSON string must be escaped.
- Example: write "\\begin{bmatrix}" inside JSON, not "\begin{bmatrix}".
- Example: a LaTeX row break "\\" must appear as "\\\\" inside JSON strings.`
}


function buildUserPrompt(
  subject: string,
  topic: string,
  difficulty: QuizDifficulty,
  questionCount: number,
  examTarget: string,
  questionTypes: QuizQuestionType[],
): string {
  const typeList = questionTypes.join(', ')
  const difficultyNote = difficulty === 'mixed'
    ? 'Mix of easy, medium, and hard questions'
    : `All questions should be ${difficulty} difficulty`

  return String.raw`Generate exactly ${questionCount} quiz question(s) for:
Exam: ${examTarget}
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficultyNote}
Question types to use (rotate through these): ${typeList}

Important JSON escaping rule for math:
- Escape every LaTeX backslash in JSON strings.
- Use "\\begin{bmatrix}" in JSON, not "\begin{bmatrix}".
- Use "\\\\" in JSON when the rendered LaTeX needs "\\".

Return only a JSON array. Example format:
[{
  "id": "",
  "questionText": "If $A = \\begin{bmatrix} 2 & 3 \\\\ 4 & 5 \\end{bmatrix}$, then $\\det(A)$ is:",
  "options": ["$-2$", "$2$", "$22$", "$-22$"],
  "correctAnswer": "$-2$",
  "explanation": "For a $2 \\times 2$ matrix $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$, $\\det(A) = ad - bc = (2)(5) - (3)(4) = 10 - 12 = -2$.",
  "difficulty": "medium",
  "subject": "${subject}",
  "topic": "${topic}",
  "type": "mcq"
}]`
}

// ─── Response Parser & Validator ──────────────────────────────────────────────

function repairLatexJsonStringEscapes(candidate: string): string {
  return candidate.replace(/"(?:[^"\\]|\\.)*"/g, (segment) => {
    const inner = segment
      .slice(1, -1)
      .replace(/(?<!\\)\\(?=[A-Za-z()[\]{}])/g, '\\\\')
      .replace(/(?<!\\)\\\\(?!\\)(?=\s|&|[-+0-9])/g, '\\\\\\\\')

    return `"${inner}"`
  })
}

function parseJsonArrayCandidate(candidate: string): unknown[] | null {
  const normalized = candidate.trim()
  if (!normalized) return null

  const attempts = [
    normalized,
    normalized.replace(/,\s*([\]\}])/g, '$1'),
  ]

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt)
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* fall through */
    }
  }

  const repaired = repairLatexJsonStringEscapes(normalized)
  const repairedAttempts = [
    repaired,
    repaired.replace(/,\s*([\]\}])/g, '$1'),
  ]

  for (const attempt of repairedAttempts) {
    try {
      const parsed = JSON.parse(attempt)
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* fall through */
    }
  }

  return null
}

function extractJsonArray(raw: string): unknown[] | null {
  const candidates: string[] = []
  const trimmed = raw.trim()
  if (trimmed) candidates.push(trimmed)

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim())

  const firstBracket = raw.indexOf('[')
  const lastBracket = raw.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(raw.slice(firstBracket, lastBracket + 1).trim())
  }

  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/\s*```/g, '')
    .trim()
  const firstB = cleaned.indexOf('[')
  const lastB = cleaned.lastIndexOf(']')
  if (firstB >= 0 && lastB > firstB) {
    candidates.push(cleaned.slice(firstB, lastB + 1).trim())
  }

  const uniqueCandidates = Array.from(new Set(candidates))
  for (const candidate of uniqueCandidates) {
    const parsed = parseJsonArrayCandidate(candidate)
    if (parsed) return parsed
  }

  return null
}

function parseAndValidateQuestions(
  raw: string,
  subject: ExamSubject,
  topic: string,
  difficulty: QuizDifficulty,
  maxCount: number,
): QuizQuestion[] {
  const parsed = extractJsonArray(raw)
  if (!parsed) {
    console.warn('[ExamBuddy] Quiz generation: failed to parse JSON array from model response')
    return []
  }

  const valid: QuizQuestion[] = []

  for (const item of parsed) {
    if (valid.length >= maxCount) break
    if (typeof item !== 'object' || item === null) continue

    const q = item as Record<string, unknown>

    // Coerce answer / explanation / question — models often return
    // numbers for numerical answers or booleans for true/false answers.
    const questionTextRaw =
      typeof q.questionText === 'string' ? q.questionText : ''
    const correctAnswerRaw =
      q.correctAnswer === null || q.correctAnswer === undefined
        ? ''
        : String(q.correctAnswer)
    const explanationRaw =
      typeof q.explanation === 'string' ? q.explanation : ''

    if (!questionTextRaw.trim() || !correctAnswerRaw.trim() || !explanationRaw.trim()) continue

    // Type validation — default to mcq if missing
    const rawType = typeof q.type === 'string' ? q.type.toLowerCase() : 'mcq'
    const type: QuizQuestionType =
      rawType === 'true_false' || rawType === 'tf' || rawType === 'truefalse'
        ? 'true_false'
        : rawType === 'numerical' || rawType === 'number'
        ? 'numerical'
        : 'mcq'

    // options: coerce primitives to strings; default to [] for numerical
    const rawOptions: unknown[] = Array.isArray(q.options) ? q.options : []
    const options = rawOptions
      .map((o) => {
        if (typeof o === 'string') return o
        if (typeof o === 'number' || typeof o === 'boolean') return String(o)
        return ''
      })
      .filter((o) => o.trim())
      .map((o) => sanitizeField(o, MAX_OPTION_LEN))

    if (type === 'mcq' && options.length < 2) continue
    if (type === 'true_false' && options.length !== 2) {
      options.splice(0, options.length, 'True', 'False')
    }

    const questionText = sanitizeField(questionTextRaw, MAX_QUESTION_LEN)
    const correctAnswer = sanitizeField(correctAnswerRaw, MAX_OPTION_LEN)
    const explanation = sanitizeField(explanationRaw, MAX_EXPLANATION_LEN)

    if (!questionText || !correctAnswer || !explanation) continue

    valid.push({
      id: nanoid(8),
      questionText,
      options,
      correctAnswer,
      explanation,
      difficulty: (q.difficulty as QuizDifficulty) || difficulty,
      subject,
      topic,
      type,
    })
  }

  return valid
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateQuiz(
  subject: ExamSubject,
  topic: string,
  difficulty: QuizDifficulty,
  questionCount: number,
  examTarget: ExamTarget,
  questionTypes: QuizQuestionType[],
): Promise<QuizQuestion[]> {
  const result = await generateQuizWithDiagnostics(
    subject,
    topic,
    difficulty,
    questionCount,
    examTarget,
    questionTypes,
  )
  return result.questions
}

export async function generateQuizWithDiagnostics(
  subject: ExamSubject,
  topic: string,
  difficulty: QuizDifficulty,
  questionCount: number,
  examTarget: ExamTarget,
  questionTypes: QuizQuestionType[],
): Promise<QuizGenerationResult> {
  // Validate inputs
  const validation = generateQuizInputSchema.safeParse({
    subject,
    topic,
    difficulty,
    questionCount,
    examTarget,
    questionTypes,
  })
  if (!validation.success) {
    return {
      questions: [],
      reason: 'invalid_input',
      detail: validation.error.issues[0]?.message,
    }
  }

  // Sanitize topic before injecting into prompt
  const safeTopic = sanitizeMemories(stripHtml(topic)).slice(0, 100)

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(
    subject,
    safeTopic,
    difficulty,
    Math.min(questionCount, MAX_QUESTIONS),
    examTarget,
    questionTypes,
  )

  // Race against timeout — use gemini-2.5-flash for fast, reliable JSON output
  const generatePromise = callGeminiDirect(systemPrompt, userPrompt, {
    temperature: 0.4,
    maxOutputTokens: 4096,
    model: 'gemini-2.5-flash',
    timeoutMs: GENERATION_TIMEOUT_MS,
  })

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Quiz generation timeout')), GENERATION_TIMEOUT_MS),
  )

  let raw: string
  try {
    raw = await Promise.race([generatePromise, timeoutPromise])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[ExamBuddy] Quiz generation failed:', msg)
    const reason: QuizGenerationFailureReason = /timeout/i.test(msg) ? 'timeout' : 'provider_error'
    return { questions: [], reason, detail: msg }
  }

  if (!raw || !raw.trim()) {
    console.warn('[ExamBuddy] Quiz generation: empty provider response')
    return { questions: [], reason: 'empty_response' }
  }

  const questions = parseAndValidateQuestions(
    raw,
    subject,
    topic,
    difficulty,
    Math.min(questionCount, MAX_QUESTIONS),
  )
  if (questions.length === 0) {
    const snippet = raw.slice(0, 300).replace(/\s+/g, ' ')
    console.warn('[ExamBuddy] Quiz generation: zero valid questions. Raw snippet:', snippet)
    const reason: QuizGenerationFailureReason = extractJsonArray(raw)
      ? 'no_valid_questions'
      : 'unparseable_response'
    return { questions: [], reason, detail: snippet }
  }
  return { questions }
}
