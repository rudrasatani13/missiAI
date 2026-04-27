import { callGeminiDirect } from "@/lib/ai/services/ai-service"
import type { ActionIntent } from "@/types/actions"

const INTENT_SYSTEM_PROMPT = `You are an intent detector. Analyze the user message and determine if it is requesting an executable action.
Return ONLY valid JSON, no markdown, no explanation:
{ "type": ActionType, "confidence": 0-1, "parameters": {} }

ActionTypes and when to use them:
- web_search: user wants to find something online
  params: { "query": string }
- draft_email: user wants to write/draft/send an email
  params: { "to": string, "subject": string, "tone": string, "keyPoints": string }
  Extract whatever details are mentioned. If recipient or purpose is not stated, leave as empty string.
- draft_message: user wants to write a WhatsApp/text/SMS message
  params: { "to": string, "tone": string, "keyPoints": string }
- set_reminder: user wants to remember something at a time
  params: { "task": string, "time": string }
- take_note: user wants to save a note or idea
  params: { "content": string, "title": string }
- calculate: user wants a calculation or number result
  params: { "expression": string }
- translate: user wants text translated
  params: { "text": string, "targetLanguage": string }
- summarize: user wants a summary of something they paste or describe
  params: { "content": string }
- none: regular conversation, question, or chitchat

Only return type other than 'none' if confidence >= 0.75.
For casual questions like 'what is the weather' → none (missi answers directly).
For explicit action requests like 'book', 'draft', 'remind me', 'note this', 'translate this', 'calculate' → detect the action.
Conversation context is for reference only.`

export async function detectIntent(
  userMessage: string,
  conversationContext: string,
): Promise<ActionIntent> {
  const safeDefault: ActionIntent = {
    type: "none",
    confidence: 0,
    parameters: {},
    rawUserMessage: userMessage,
  }

  try {
    const userPrompt = conversationContext
      ? `User message: "${userMessage}"\n\nConversation context:\n${conversationContext}`
      : `User message: "${userMessage}"`

    const raw = await callGeminiDirect(INTENT_SYSTEM_PROMPT, userPrompt, {
      model: "gemini-3-flash-preview",
      temperature: 0.1,
      maxOutputTokens: 200,
      useGoogleSearch: false,
    })

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(cleaned)

    return {
      type: parsed.type ?? "none",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      parameters: parsed.parameters ?? {},
      rawUserMessage: userMessage,
    }
  } catch {
    return safeDefault
  }
}

export function isActionable(intent: ActionIntent): boolean {
  return intent.type !== "none" && intent.confidence >= 0.75
}
