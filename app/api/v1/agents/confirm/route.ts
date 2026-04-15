import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { z } from "zod"
import { verifyAndConsumeToken } from "@/lib/ai/agent-confirm"
import { executeAgentTool, AgentToolCall } from "@/lib/ai/agent-tools"
import { addAgentHistory } from "@/lib/ai/agent-history"
import { awardXP } from "@/lib/gamification/xp-engine"
import { getEnv } from "@/lib/server/env"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

const confirmSchema = z.object({
  confirmToken: z.string().min(1).max(200),
  approved: z.boolean(),
  originalMessage: z.string().optional() // Passed from client for history tracking
})

export async function POST(req: NextRequest) {
  try {
    const userId = await getVerifiedUserId()
    const kv = getKV()

    if (!kv) {
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 500 })
    }

    const { env } = getRequestContext()
    const vectorizeEnv = (env as any).LIFE_GRAPH ? { LIFE_GRAPH: (env as any).LIFE_GRAPH } : null

    const body = await req.json()
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 })
    }

    const { confirmToken, approved, originalMessage } = parsed.data

    const plan = await verifyAndConsumeToken(kv, confirmToken, userId)

    if (!plan) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400 })
    }

    if (!approved) {
      await addAgentHistory(kv, userId, {
        id: Math.random().toString(36).substring(2, 10),
        date: new Date().toISOString(),
        userMessage: (originalMessage || "").slice(0, 100),
        planSummary: plan.summary,
        stepsCompleted: 0,
        stepsTotal: plan.steps.length,
        status: 'cancelled'
      })
      return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 })
    }

    const appEnv = getEnv()
    const geminiApiKey = appEnv.GEMINI_API_KEY

    // Set up SSE
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        const sendSSE = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        let stepsCompleted = 0

        for (const step of plan.steps) {
          sendSSE({ type: 'step_start', stepNumber: step.stepNumber, description: step.description })

          const toolCall: AgentToolCall = {
            name: step.toolName,
            args: {}
          }

          if (originalMessage) {
            toolCall.args = {
              query: originalMessage,
              content: originalMessage,
              description: originalMessage,
              progressNote: originalMessage,
              goalTitle: "General Goal",
              title: "Agent Task",
              body: originalMessage,
              to: "someone@example.com",
              subject: "Agent Task",
              amount: 0,
              category: "other"
            }
          }

          const result = await executeAgentTool(toolCall, {
            kv,
            vectorizeEnv,
            userId,
            apiKey: geminiApiKey
          })

          if (result.status === "error") {
            sendSSE({ type: 'step_error', stepNumber: step.stepNumber, error: result.output })
          } else {
            stepsCompleted++
            sendSSE({ type: 'step_done', stepNumber: step.stepNumber, summary: result.summary, output: result.output })
            awardXP(kv, userId, 'agent', 2).catch(() => {})
          }
        }

        sendSSE({ type: 'complete', summary: "All done! Here's what I did." })

        await addAgentHistory(kv, userId, {
          id: Math.random().toString(36).substring(2, 10),
          date: new Date().toISOString(),
          userMessage: (originalMessage || "").slice(0, 100),
          planSummary: plan.summary,
          stepsCompleted,
          stepsTotal: plan.steps.length,
          status: stepsCompleted === plan.steps.length ? 'completed' : 'partial'
        })

        controller.close()
      }
    })

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no"
      }
    })
  } catch (err) {
    if (err instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
}
