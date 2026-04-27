import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"

const PLATFORM_SUFFIXES: Record<string, string> = {
  twitter: " site:twitter.com OR site:x.com",
  reddit: " site:reddit.com",
  youtube: " site:youtube.com",
  instagram: " site:instagram.com",
  tiktok: " site:tiktok.com",
  news: " (news OR breaking OR latest OR headlines)",
}

export async function executeSearchTool(
  call: AgentToolCall,
  _ctx: ToolContext,
): Promise<AgentStepResult | null> {
  const { name, args } = call

  switch (name) {
    case "searchWeb": {
      const query = String(args.query || "").slice(0, 200)
      if (!query) {
        return { toolName: name, status: "error", summary: "No query", output: "Please provide a search query." }
      }

      const platform = String(args.platform || "general")
      const platformSuffix = PLATFORM_SUFFIXES[platform] || ""
      const enhancedQuery = `${query}${platformSuffix}`

      try {
        const { geminiGenerate } = await import("@/lib/ai/providers/vertex-client")
        const searchBody = {
          contents: [{ role: "user", parts: [{ text: `Search the web and give me a concise summary about: ${enhancedQuery}` }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }

        const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)

        if (!searchRes.ok) {
          return {
            toolName: name,
            status: "done",
            summary: `Searched for "${query}"`,
            output: `I searched for "${query}" but couldn't get results right now. Try asking in the chat for a more detailed answer.`,
          }
        }

        const searchData = await searchRes.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> }
            groundingMetadata?: {
              searchEntryPoint?: { renderedContent?: string }
              groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
            }
          }>
        }

        const parts = searchData?.candidates?.[0]?.content?.parts ?? []
        const responseText = parts.map((part) => part.text ?? "").join("").trim()
        const output = responseText || `No results found for "${query}".`

        return {
          toolName: name,
          status: "done",
          summary: `Found results for "${query}"`,
          output,
        }
      } catch (err) {
        console.error("[searchWeb] Error:", err)
        return {
          toolName: name,
          status: "done",
          summary: `Searched for "${query}"`,
          output: `Search for "${query}" encountered an error. Try asking in the chat instead.`,
        }
      }
    }

    case "searchNews": {
      const query = String(args.query || "").slice(0, 200)
      const category = String(args.category || "general")

      try {
        const { geminiGenerate } = await import("@/lib/ai/providers/vertex-client")
        const newsPrompt = query
          ? `Search for the latest news about: ${query}. Give me a concise summary of the top 5 most recent and relevant news articles with dates and sources.`
          : `What are today's top ${category} news headlines? Give me a concise summary of the top 5 most important stories with dates and sources.`

        const searchBody = {
          contents: [{ role: "user", parts: [{ text: newsPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }

        const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)
        if (!searchRes.ok) {
          return { toolName: name, status: "done", summary: "News search failed", output: "Could not fetch news right now. Try again later." }
        }

        const searchData = await searchRes.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }

        const parts = searchData?.candidates?.[0]?.content?.parts ?? []
        const responseText = parts.map((part) => part.text ?? "").join("").trim()

        return {
          toolName: name,
          status: "done",
          summary: query ? `News about "${query}"` : `Top ${category} headlines`,
          output: responseText || "No news results found.",
        }
      } catch (err) {
        console.error("[searchNews] Error:", err)
        return { toolName: name, status: "error", summary: "News search failed", output: "Error searching for news." }
      }
    }

    case "searchYouTube": {
      const query = String(args.query || "").slice(0, 200)
      if (!query) {
        return { toolName: name, status: "error", summary: "No query", output: "Please provide a search query for YouTube." }
      }

      try {
        const { geminiGenerate } = await import("@/lib/ai/providers/vertex-client")
        const searchBody = {
          contents: [{
            role: "user",
            parts: [{ text: `Search YouTube for videos about: ${query}. List the top ${Math.min(Number(args.maxResults) || 5, 10)} results with video title, channel name, and a brief description of what each video covers.` }],
          }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }

        const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)
        if (!searchRes.ok) {
          return { toolName: name, status: "done", summary: "YouTube search failed", output: "Could not search YouTube right now." }
        }

        const searchData = await searchRes.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }

        const parts = searchData?.candidates?.[0]?.content?.parts ?? []
        const responseText = parts.map((part) => part.text ?? "").join("").trim()

        return {
          toolName: name,
          status: "done",
          summary: `YouTube results for "${query}"`,
          output: responseText || `No YouTube videos found for "${query}".`,
        }
      } catch (err) {
        console.error("[searchYouTube] Error:", err)
        return { toolName: name, status: "error", summary: "YouTube search failed", output: "Error searching YouTube." }
      }
    }

    default:
      return null
  }
}
