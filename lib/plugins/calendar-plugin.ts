import { callAIDirect } from "@/services/ai.service"
import type { PluginResult } from "@/types/plugins"

// ─── Google Calendar Plugin ───────────────────────────────────────────────────
// All calls use fetch() — no SDK, fully edge-compatible.

const TIMEOUT_MS = 10_000

interface EventDetails {
  title: string
  startDateTime: string
  endDateTime: string
  description: string
}

/**
 * Extract calendar event details from a natural-language voice command
 * using the AI service. Returns safe defaults on parse failure.
 */
export async function parseEventFromCommand(
  userMessage: string,
  _apiKey: string,
): Promise<EventDetails> {
  const system = `Extract calendar event details from the user message.
Return ONLY valid JSON:
{ "title": string, "startDateTime": string (ISO 8601), "endDateTime": string (ISO 8601), "description": string }
For relative times like 'tomorrow 3pm', use today's date as base.
Duration default: 1 hour if not specified.
Return empty strings if not determinable.`

  try {
    const raw = await callAIDirect(system, userMessage, {
      temperature: 0.1,
      maxOutputTokens: 200,
      useGoogleSearch: false,
    })

    // Strip markdown code fences if present
    const cleaned = raw.replace(/```(?:json)?/gi, "").trim()
    const parsed = JSON.parse(cleaned)

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      startDateTime: typeof parsed.startDateTime === "string" ? parsed.startDateTime : "",
      endDateTime: typeof parsed.endDateTime === "string" ? parsed.endDateTime : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
    }
  } catch {
    return { title: "", startDateTime: "", endDateTime: "", description: "" }
  }
}

/**
 * Create a Google Calendar event via the Calendar API.
 * POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventDetails: EventDetails,
): Promise<PluginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          summary: eventDetails.title,
          description: eventDetails.description,
          start: { dateTime: eventDetails.startDateTime, timeZone: "UTC" },
          end: { dateTime: eventDetails.endDateTime, timeZone: "UTC" },
        }),
        signal: controller.signal,
      },
    )

    if (res.status === 401) {
      return {
        success: false,
        pluginId: "google_calendar",
        action: "create_event",
        output: "Calendar access expired. Please reconnect Google Calendar.",
        executedAt: Date.now(),
      }
    }

    if (!res.ok) {
      return {
        success: false,
        pluginId: "google_calendar",
        action: "create_event",
        output: "Couldn't create calendar event. Try again.",
        executedAt: Date.now(),
      }
    }

    const data = await res.json()
    return {
      success: true,
      pluginId: "google_calendar",
      action: "create_event",
      output: `Event "${eventDetails.title}" added to your calendar`,
      url: (data as any).htmlLink,
      executedAt: Date.now(),
    }
  } catch {
    return {
      success: false,
      pluginId: "google_calendar",
      action: "create_event",
      output: "Couldn't create calendar event. Try again.",
      executedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
  }
}
