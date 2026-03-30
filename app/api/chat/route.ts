import { NextRequest } from "next/server"
import { generateResponse } from "@/services/ai.service"
import type { Message, PersonalityKey } from "@/types"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const { messages, personality, memories } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const responseText = await generateResponse(
      messages as Message[],
      (personality as PersonalityKey) || "bestfriend",
      (memories as string) || ""
    )

    if (!responseText) {
      return new Response(
        JSON.stringify({ success: false, error: "Empty response from AI" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    // Chunk into SSE stream — frontend reads text/event-stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 100
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, i + chunkSize)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("Chat route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
