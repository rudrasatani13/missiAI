import { callAIDirect } from "@/services/ai.service"
import type { ActionIntent, ActionResult } from "@/types/actions"

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + "..." : str
}

function failResult(type: ActionIntent["type"]): ActionResult {
  return {
    success: false,
    type,
    output: "Action failed. Try again.",
    actionTaken: "Action failed",
    canUndo: false,
    executedAt: Date.now(),
  }
}

// ─── Safe Math Parser ────────────────────────────────────────────────────────

function safeMathEval(expression: string): number | null {
  try {
    const cleaned = expression
      .replace(/[^0-9+\-*/().%^ sqrtofpin]/gi, " ")
      .trim()

    // Handle percentage patterns: "15% of 2400", "15% tip on 2400"
    const pctOf = cleaned.match(/([\d.]+)\s*%\s*(?:of|on|tip on|tip of)?\s*([\d.]+)/i)
    if (pctOf) {
      return (parseFloat(pctOf[1]) / 100) * parseFloat(pctOf[2])
    }

    // Handle "X% of Y" reversed: "what is 20% of 500"
    const pctSimple = cleaned.match(/([\d.]+)\s*%/)
    if (pctSimple && !cleaned.includes("+") && !cleaned.includes("-") && !cleaned.includes("*") && !cleaned.includes("/")) {
      const nums = cleaned.match(/[\d.]+/g)
      if (nums && nums.length === 2) {
        return (parseFloat(nums[0]) / 100) * parseFloat(nums[1])
      }
    }

    // Handle sqrt
    const sqrtMatch = cleaned.match(/sqrt\s*\(?\s*([\d.]+)\s*\)?/i)
    if (sqrtMatch) {
      return Math.sqrt(parseFloat(sqrtMatch[1]))
    }

    // Simple recursive descent parser for basic arithmetic
    return parseExpression(cleaned)
  } catch {
    return null
  }
}

function parseExpression(expr: string): number {
  let pos = 0
  const str = expr.replace(/\s+/g, "")

  function parseAddSub(): number {
    let left = parseMulDiv()
    while (pos < str.length && (str[pos] === "+" || str[pos] === "-")) {
      const op = str[pos++]
      const right = parseMulDiv()
      left = op === "+" ? left + right : left - right
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parsePower()
    while (pos < str.length && (str[pos] === "*" || str[pos] === "/")) {
      const op = str[pos++]
      const right = parsePower()
      if (op === "/" && right === 0) throw new Error("Division by zero")
      left = op === "*" ? left * right : left / right
    }
    return left
  }

  function parsePower(): number {
    let left = parseUnary()
    if (pos < str.length && str[pos] === "^") {
      pos++
      const right = parseUnary()
      left = Math.pow(left, right)
    }
    return left
  }

  function parseUnary(): number {
    if (str[pos] === "-") {
      pos++
      return -parsePrimary()
    }
    if (str[pos] === "+") {
      pos++
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    if (str[pos] === "(") {
      pos++ // skip (
      const val = parseAddSub()
      if (str[pos] === ")") pos++ // skip )
      return val
    }

    // Parse a number
    const start = pos
    while (pos < str.length && (str[pos] >= "0" && str[pos] <= "9" || str[pos] === ".")) {
      pos++
    }
    if (pos === start) throw new Error("Unexpected token")
    return parseFloat(str.slice(start, pos))
  }

  const result = parseAddSub()
  return result
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function handleWebSearch(intent: ActionIntent): Promise<ActionResult> {
  const query = intent.parameters.query || intent.rawUserMessage
  const output = await callAIDirect(
    "You are a search assistant. Search for the query and return a concise 2-3 sentence summary of the most relevant results. No markdown, no lists, plain sentences only.",
    query,
    { useGoogleSearch: true, maxOutputTokens: 300 },
  )
  return {
    success: true,
    type: "web_search",
    output: truncate(output, 300),
    actionTaken: `Searched for "${truncate(query, 60)}"`,
    canUndo: false,
    executedAt: Date.now(),
  }
}

async function handleDraftEmail(intent: ActionIntent): Promise<ActionResult> {
  const { to = "", subject = "", tone = "professional", keyPoints = "" } = intent.parameters

  // If no recipient and no purpose, return a clarification prompt instead of a blank email
  if (!to.trim() && !keyPoints.trim() && !subject.trim()) {
    return {
      success: true,
      type: "draft_email",
      output: "Who should I send this email to, and what should it be about? Tell me and I'll draft it right away.",
      data: { fullDraft: "", to, subject, tone },
      actionTaken: "Needs more info to draft email",
      canUndo: false,
      executedAt: Date.now(),
    }
  }

  const fullDraft = await callAIDirect(
    `You are an email writing assistant. Write a complete, ready-to-send email based on the given details.
Rules:
- Write the FULL email: greeting, body paragraphs, closing, and sign-off
- Use real content — DO NOT use placeholder text like [Name], [Date], [Manager's Name], [Your Name] etc.
- If the recipient's actual name is unknown, use a generic but natural greeting like "Dear Manager," or "Dear Sir/Madam,"
- If specific dates or details are missing, write natural placeholder text like "from [leave start date] to [leave end date]" only where absolutely necessary
- Tone must match: ${tone}
- Return ONLY the complete email text. No subject line header, no To: field, no markdown, no commentary.`,
    `Write a complete email to: ${to || "the recipient"}, about: ${subject || keyPoints}, tone: ${tone}, details: ${keyPoints}`,
    { useGoogleSearch: false, maxOutputTokens: 800 },
  )
  return {
    success: true,
    type: "draft_email",
    output: fullDraft,
    data: { fullDraft, to, subject, tone },
    actionTaken: `Drafted email to ${to || "recipient"} about ${subject || keyPoints}`,
    canUndo: false,
    executedAt: Date.now(),
  }
}

async function handleDraftMessage(intent: ActionIntent): Promise<ActionResult> {
  const { to = "", tone = "casual", keyPoints = "" } = intent.parameters
  const fullDraft = await callAIDirect(
    "Write a WhatsApp/text message based on parameters. Short, conversational, natural. No markdown.",
    `Write message to: ${to}, tone: ${tone}, key points: ${keyPoints}`,
    { useGoogleSearch: false, maxOutputTokens: 300 },
  )
  return {
    success: true,
    type: "draft_message",
    output: truncate(fullDraft, 300),
    data: { fullDraft, to, tone },
    actionTaken: `Drafted message to ${to}`,
    canUndo: false,
    executedAt: Date.now(),
  }
}

function handleSetReminder(intent: ActionIntent): ActionResult {
  const { task = "", time = "" } = intent.parameters
  return {
    success: true,
    type: "set_reminder",
    output: truncate(`Got it! I'll remind you to ${task} at ${time}.`, 300),
    data: { task, time, createdAt: Date.now() },
    actionTaken: `Set reminder: ${task}`,
    canUndo: true,
    executedAt: Date.now(),
  }
}

function handleTakeNote(intent: ActionIntent): ActionResult {
  const { title = "Untitled note", content = "" } = intent.parameters
  return {
    success: true,
    type: "take_note",
    output: truncate(`Note saved: ${title}`, 300),
    data: { title, content, createdAt: Date.now() },
    actionTaken: `Saved note: ${title}`,
    canUndo: true,
    executedAt: Date.now(),
  }
}

async function handleCalculate(intent: ActionIntent): Promise<ActionResult> {
  const expression = intent.parameters.expression || intent.rawUserMessage
  const mathResult = safeMathEval(expression)

  if (mathResult !== null && isFinite(mathResult)) {
    const formatted = Number.isInteger(mathResult)
      ? String(mathResult)
      : mathResult.toFixed(4).replace(/\.?0+$/, "")
    return {
      success: true,
      type: "calculate",
      output: truncate(`${expression} = ${formatted}`, 300),
      data: { expression, result: mathResult },
      actionTaken: `Calculated: ${expression}`,
      canUndo: false,
      executedAt: Date.now(),
    }
  }

  // Fallback to AI for complex expressions
  const aiResult = await callAIDirect(
    "You are a math calculator. Evaluate the given math expression and return ONLY the numeric result. No explanation, no steps, just the number.",
    expression,
    { useGoogleSearch: false, maxOutputTokens: 100 },
  )
  return {
    success: true,
    type: "calculate",
    output: truncate(`${expression} = ${aiResult.trim()}`, 300),
    data: { expression, result: aiResult.trim() },
    actionTaken: `Calculated: ${expression}`,
    canUndo: false,
    executedAt: Date.now(),
  }
}

async function handleTranslate(intent: ActionIntent): Promise<ActionResult> {
  const { text = "", targetLanguage = "" } = intent.parameters
  const translated = await callAIDirect(
    "You are a translator. Translate the given text to the target language. Return ONLY the translation, nothing else.",
    `Translate to ${targetLanguage}: ${text}`,
    { useGoogleSearch: false, maxOutputTokens: 300 },
  )
  return {
    success: true,
    type: "translate",
    output: truncate(translated, 300),
    data: { originalText: text, targetLanguage, translation: translated },
    actionTaken: `Translated to ${targetLanguage}`,
    canUndo: false,
    executedAt: Date.now(),
  }
}

async function handleSummarize(intent: ActionIntent): Promise<ActionResult> {
  const content = intent.parameters.content || intent.rawUserMessage
  const summary = await callAIDirect(
    "Summarize the given content in 2-3 sentences. Plain text only.",
    content,
    { useGoogleSearch: false, maxOutputTokens: 200 },
  )
  return {
    success: true,
    type: "summarize",
    output: truncate(summary, 300),
    actionTaken: "Summarized content",
    canUndo: false,
    executedAt: Date.now(),
  }
}

// ─── Main Executor ───────────────────────────────────────────────────────────

export async function executeAction(
  intent: ActionIntent,
): Promise<ActionResult> {
  try {
    switch (intent.type) {
      case "web_search":
        return await handleWebSearch(intent)
      case "draft_email":
        return await handleDraftEmail(intent)
      case "draft_message":
        return await handleDraftMessage(intent)
      case "set_reminder":
        return handleSetReminder(intent)
      case "take_note":
        return handleTakeNote(intent)
      case "calculate":
        return await handleCalculate(intent)
      case "translate":
        return await handleTranslate(intent)
      case "summarize":
        return await handleSummarize(intent)
      default:
        return failResult(intent.type)
    }
  } catch {
    return failResult(intent.type)
  }
}
