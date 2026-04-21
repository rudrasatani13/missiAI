import type { PluginResult } from "@/types/plugins"

// ─── Notion Plugin ─────────────────────────────────────────────────────────────
// All calls use fetch() — no SDK, fully edge-compatible.

const NOTION_API_BASE = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"
const TIMEOUT_MS = 10_000

function notionHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

/**
 * Append a paragraph block to an existing Notion page.
 * PATCH /v1/blocks/{pageId}/children
 */
export async function appendToNotionPage(
  apiKey: string,
  pageId: string,
  content: string,
): Promise<PluginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: notionHeaders(apiKey),
      body: JSON.stringify({
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: content.slice(0, 2000) } }],
            },
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        success: false,
        pluginId: "notion",
        action: "append_to_page",
        output: "Couldn't create Notion page. Check your API key.",
        executedAt: Date.now(),
      }
    }

    return {
      success: true,
      pluginId: "notion",
      action: "append_to_page",
      output: "Content appended to your Notion page",
      executedAt: Date.now(),
    }
  } catch {
    return {
      success: false,
      pluginId: "notion",
      action: "append_to_page",
      output: "Couldn't create Notion page. Check your API key.",
      executedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Create a new Notion page under a parent page.
 * POST /v1/pages
 */
export async function createNotionPage(
  apiKey: string,
  parentPageId: string,
  title: string,
  content: string,
): Promise<PluginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: title } }],
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: content.slice(0, 2000) } }],
            },
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        success: false,
        pluginId: "notion",
        action: "create_page",
        output: "Couldn't create Notion page. Check your API key.",
        executedAt: Date.now(),
      }
    }

    const data = await res.json()
    return {
      success: true,
      pluginId: "notion",
      action: "create_page",
      output: `Page "${title}" created in Notion`,
      url: (data as any).url,
      executedAt: Date.now(),
    }
  } catch {
    return {
      success: false,
      pluginId: "notion",
      action: "create_page",
      output: "Couldn't create Notion page. Check your API key.",
      executedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Add an entry to a Notion database.
 * POST /v1/pages with database_id parent, then append content block.
 */
export async function addToNotionDatabase(
  apiKey: string,
  databaseId: string,
  title: string,
  content: string,
): Promise<PluginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: notionHeaders(apiKey),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [{ text: { content: title } }],
          },
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        success: false,
        pluginId: "notion",
        action: "add_to_database",
        output: "Couldn't create Notion page. Check your API key.",
        executedAt: Date.now(),
      }
    }

    const created = await res.json()
    const pageId = (created as any).id

    // Append content as a block to the newly created page
    if (pageId && content) {
      const appendController = new AbortController()
      const appendTimer = setTimeout(() => appendController.abort(), TIMEOUT_MS)
      try {
        await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
          method: "PATCH",
          headers: notionHeaders(apiKey),
          body: JSON.stringify({
            children: [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ text: { content: content.slice(0, 2000) } }],
                },
              },
            ],
          }),
          signal: appendController.signal,
        })
      } finally {
        clearTimeout(appendTimer)
      }
    }

    return {
      success: true,
      pluginId: "notion",
      action: "add_to_database",
      output: `"${title}" added to your Notion database`,
      url: (created as any).url,
      executedAt: Date.now(),
    }
  } catch {
    return {
      success: false,
      pluginId: "notion",
      action: "add_to_database",
      output: "Couldn't create Notion page. Check your API key.",
      executedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
  }
}
