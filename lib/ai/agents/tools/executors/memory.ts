import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { abortedToolResult } from "@/lib/ai/agents/tools/shared"
import { searchLifeGraph, formatLifeGraphForPrompt, addOrUpdateNode, getLifeGraphReadSnapshot } from "@/lib/memory/life-graph"
import { getNotionTokens } from "@/lib/plugins/data-fetcher"
import { addNote, addReminder } from "@/lib/actions/store"
import { stripHtml } from "@/lib/validation/sanitizer"

const WEEK_SUMMARY_GRAPH_READ_OPTIONS = { limit: 250, newestFirst: true } as const

export async function executeMemoryProductivityTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult | null> {
  const { name, args } = call

  switch (name) {
    case "searchMemory": {
      if (!ctx.kv) {
        return {
          toolName: name,
          status: "error",
          summary: "Memory storage unavailable",
          output: "No memories found — storage is not connected.",
        }
      }

      const query = (args.query as string) || ""
      const results = await searchLifeGraph(
        ctx.kv,
        ctx.vectorizeEnv,
        ctx.userId,
        query,
        { topK: 5 },
      )

      if (results.length === 0) {
        return {
          toolName: name,
          status: "done",
          summary: `No memories found for "${query}"`,
          output: "No relevant memories found for this query.",
        }
      }

      const formatted = formatLifeGraphForPrompt(results)
      return {
        toolName: name,
        status: "done",
        summary: `Found ${results.length} memory nodes`,
        output: formatted,
      }
    }

    case "setReminder": {
      // SEC-003 fix: strip HTML from args before KV storage so injected
      // markup can't re-enter the AI context via searchMemory recall.
      const task = stripHtml((args.task as string) || "Untitled reminder")
      const time = stripHtml((args.time as string) || "unspecified")

      if (ctx.kv) {
        const aborted = abortedToolResult(name, ctx)
        if (aborted) return aborted
        await addReminder(ctx.kv, ctx.userId, { task, time })
      }

      return {
        toolName: name,
        status: "done",
        summary: `Reminder set: "${task}"`,
        output: `Reminder created — task: "${task}", time: "${time}"`,
      }
    }

    case "takeNote": {
      // SEC-003 fix: strip HTML from args before KV storage.
      const title = stripHtml((args.title as string) || "Quick Note")
      const content = stripHtml((args.content as string) || "")

      if (ctx.kv) {
        const aborted = abortedToolResult(name, ctx)
        if (aborted) return aborted
        await addNote(ctx.kv, ctx.userId, { title, content })
      }

      return {
        toolName: name,
        status: "done",
        summary: `Note saved: "${title}"`,
        output: `Note saved — title: "${title}"`,
      }
    }

    case "createNote": {
      const sanitizedTitle = stripHtml(String(args.title || "")).slice(0, 80) || "New Note"
      const sanitizedContent = stripHtml(String(args.content || "")).slice(0, 2000)
      const destination = args.destination === "notion" ? "notion" : "memory"
      let savedTo = "memory"

      if (destination === "notion" && ctx.kv) {
        const notionTokens = await getNotionTokens(ctx.kv, ctx.userId)
        if (notionTokens) {
          try {
            const aborted = abortedToolResult(name, ctx)
            if (aborted) return aborted
            const notionRes = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${notionTokens.accessToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
              },
              body: JSON.stringify({
                parent: { workspace: true },
                properties: {
                  title: { title: [{ type: "text", text: { content: sanitizedTitle } }] },
                },
                children: [
                  {
                    object: "block",
                    type: "paragraph",
                    paragraph: { rich_text: [{ type: "text", text: { content: sanitizedContent } }] },
                  },
                ],
              }),
              signal: ctx.abortSignal,
            })
            if (notionRes.ok) {
              savedTo = `Notion (${notionTokens.workspaceName})`
            }
          } catch {
            const aborted = abortedToolResult(name, ctx)
            if (aborted) return aborted
          }
        }
      }

      if (savedTo === "memory") {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot save note — storage is not connected." }
        }
        const aborted = abortedToolResult(name, ctx)
        if (aborted) return aborted
        await addOrUpdateNode(
          ctx.kv,
          ctx.vectorizeEnv,
          ctx.userId,
          {
            userId: ctx.userId,
            category: "skill",
            title: sanitizedTitle,
            detail: sanitizedContent,
            source: "explicit",
            tags: [],
            people: [],
            emotionalWeight: 0.3,
            confidence: 0.8,
          },
        )
      }

      return {
        toolName: name,
        status: "done",
        summary: `Note saved to ${savedTo}`,
        output: `Note "${sanitizedTitle}" saved to ${savedTo}.`,
      }
    }

    case "getWeekSummary": {
      if (!ctx.kv) {
        return { toolName: name, status: "done", summary: "Week summary", output: "No data available yet — start using Missi to build your week summary!" }
      }

      const graph = await getLifeGraphReadSnapshot(ctx.kv, ctx.userId, WEEK_SUMMARY_GRAPH_READ_OPTIONS)

      const goalNodes = graph.nodes.filter((node) => node.category === "goal")

      const parts: string[] = ["📅 Your Week Summary\n"]
      if (goalNodes.length > 0) {
        parts.push(`🎯 Active goals: ${goalNodes.length}`)
        parts.push(goalNodes.slice(0, 3).map((goal) => `  • ${goal.title}`).join("\n"))
      } else {
        parts.push("🎯 No goals set yet")
      }
      parts.push(`🧠 Total memories: ${graph.nodes.length}`)

      return {
        toolName: name,
        status: "done",
        summary: "Week summary ready",
        output: parts.join("\n"),
      }
    }

    case "updateGoalProgress": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot update goal — storage is not connected." }
      }

      const goalTitle = stripHtml(String(args.goalTitle || "")).slice(0, 80)
      const progressNote = stripHtml(String(args.progressNote || "")).slice(0, 200)

      if (!goalTitle) {
        return { toolName: name, status: "error", summary: "No goal title", output: "Please specify which goal to update." }
      }

      const results = await searchLifeGraph(
        ctx.kv,
        ctx.vectorizeEnv,
        ctx.userId,
        goalTitle,
        { topK: 3, category: "goal" },
      )

      if (results.length > 0) {
        const node = results[0].node
        const timestamp = new Date().toISOString()
        const updatedDetail = `${node.detail}\n[${timestamp}] ${progressNote}`.slice(0, 2500)
        const aborted = abortedToolResult(name, ctx)
        if (aborted) return aborted
        await addOrUpdateNode(
          ctx.kv,
          ctx.vectorizeEnv,
          ctx.userId,
          {
            userId: ctx.userId,
            category: "goal",
            title: node.title,
            detail: updatedDetail,
            tags: node.tags,
            people: node.people,
            emotionalWeight: node.emotionalWeight,
            confidence: Math.min((node.confidence || 0) + 0.05, 1.0),
            source: "explicit",
          },
        )
        return {
          toolName: name,
          status: "done",
          summary: `Goal "${node.title}" updated`,
          output: `Progress noted on "${node.title}": ${progressNote}`,
        }
      }

      // Goal not found — create new one
      const aborted = abortedToolResult(name, ctx)
      if (aborted) return aborted
      await addOrUpdateNode(
        ctx.kv,
        ctx.vectorizeEnv,
        ctx.userId,
        {
          userId: ctx.userId,
          category: "goal",
          title: goalTitle,
          detail: `[${new Date().toISOString()}] ${progressNote}`,
          tags: ["goal"],
          people: [],
          emotionalWeight: 0.6,
          confidence: 0.7,
          source: "explicit",
        },
      )

      return {
        toolName: name,
        status: "done",
        summary: `New goal "${goalTitle}" created`,
        output: `Couldn't find an existing goal matching "${goalTitle}", so I created it with your progress note.`,
      }
    }

    default:
      return null
  }
}
