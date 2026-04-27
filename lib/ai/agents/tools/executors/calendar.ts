import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { abortedToolResult, refreshGoogleTokenIfNeeded } from "@/lib/ai/agents/tools/shared"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { createCalendarEvent as gcalCreateEvent } from "@/lib/plugins/calendar-plugin"
import { stripHtml } from "@/lib/validation/sanitizer"

export async function executeCalendarTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult | null> {
  const { name, args } = call

  switch (name) {
    case "readCalendar": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
      }

      let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
      if (!tokens) {
        return {
          toolName: name,
          status: "error",
          summary: "Calendar not connected",
          output: "Google Calendar is not connected. Please connect it from Settings.",
        }
      }

      tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

      const hoursAhead = Math.min(Number(args.hoursAhead) || 48, 168)
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + hoursAhead * 3_600_000).toISOString()

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "15",
        })}`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: ctx.abortSignal },
      )

      if (!calRes.ok) {
        if (calRes.status === 401) {
          return { toolName: name, status: "error", summary: "Calendar token expired", output: "Your Google Calendar session has expired. Please reconnect." }
        }
        return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not read your calendar events." }
      }

      const calData = await calRes.json() as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> }
      const items = calData.items || []

      if (items.length === 0) {
        return { toolName: name, status: "done", summary: "No upcoming events", output: `No events found in the next ${hoursAhead} hours.` }
      }

      const lines = items.map((item) => {
        const dt = item.start?.dateTime || item.start?.date || ""
        const formatted = dt
          ? new Date(dt).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : "Unknown time"
        return `- ${formatted}: ${item.summary || "Untitled"}`
      })

      return {
        toolName: name,
        status: "done",
        summary: `Found ${items.length} upcoming events`,
        output: `Your next ${hoursAhead}h of events:\n${lines.join("\n")}`,
      }
    }

    case "createCalendarEvent": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
      }

      const tokens = await getGoogleTokens(ctx.kv, ctx.userId)
      if (!tokens) {
        return {
          toolName: name,
          status: "error",
          summary: "Calendar not connected",
          output: "Google Calendar is not connected. Please connect it from Settings.",
        }
      }

      const rawTitle = stripHtml(String(args.title || "")).slice(0, 100) || "New Event"
      const rawDesc = stripHtml(String(args.description || "")).slice(0, 300)
      const dateTimeISO = String(args.dateTimeISO || "")
      const durationMs = (Math.abs(Number(args.durationMinutes)) || 60) * 60_000

      let startDateTime: string
      try {
        startDateTime = new Date(dateTimeISO).toISOString()
      } catch {
        return { toolName: name, status: "error", summary: "Invalid date", output: "Could not parse the event date/time. Please provide a valid ISO date." }
      }

      const endDateTime = new Date(new Date(startDateTime).getTime() + durationMs).toISOString()

      const aborted = abortedToolResult(name, ctx)
      if (aborted) return aborted

      const result = await gcalCreateEvent(tokens.accessToken, "primary", {
        title: rawTitle,
        startDateTime,
        endDateTime,
        description: rawDesc,
      }, ctx.abortSignal)

      if (!result.success) {
        return { toolName: name, status: "error", summary: "Event creation failed", output: result.error || result.output || "Could not create the calendar event." }
      }

      return {
        toolName: name,
        status: "done",
        summary: `Event "${rawTitle}" created`,
        output: result.url ? `Event created! View it here: ${result.url}` : `Event "${rawTitle}" has been added to your calendar.`,
      }
    }

    case "updateCalendarEvent": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
      }

      let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
      if (!tokens) {
        return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
      }

      tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

      const searchQuery = String(args.searchQuery || "").toLowerCase()
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "20",
          q: searchQuery,
        })}`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: ctx.abortSignal },
      )

      if (!calRes.ok) {
        return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not search calendar events." }
      }

      const calData = await calRes.json() as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> }
      const items = calData.items || []
      if (items.length === 0) {
        return { toolName: name, status: "error", summary: "Event not found", output: `No event matching "${searchQuery}" found in the next 7 days.` }
      }

      const event = items[0]
      const patchBody: Record<string, unknown> = {}
      if (args.newTitle) patchBody.summary = stripHtml(String(args.newTitle)).slice(0, 100)
      if (args.newDateTimeISO) {
        const newStart = new Date(String(args.newDateTimeISO)).toISOString()
        const durationMs = (Math.abs(Number(args.newDurationMinutes)) || 60) * 60_000
        patchBody.start = { dateTime: newStart }
        patchBody.end = { dateTime: new Date(new Date(newStart).getTime() + durationMs).toISOString() }
      }

      if (Object.keys(patchBody).length === 0) {
        return { toolName: name, status: "error", summary: "No changes", output: "No changes specified. Provide a new title, date, or duration." }
      }

      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
          signal: ctx.abortSignal,
        },
      )

      if (!patchRes.ok) {
        return { toolName: name, status: "error", summary: "Update failed", output: "Could not update the calendar event." }
      }

      return {
        toolName: name,
        status: "done",
        summary: `Updated: "${event.summary || "Event"}"`,
        output: `Event "${event.summary || "Event"}" has been updated.`,
      }
    }

    case "deleteCalendarEvent": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
      }

      let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
      if (!tokens) {
        return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
      }

      tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

      const delSearchQuery = String(args.searchQuery || "").toLowerCase()
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "10",
          q: delSearchQuery,
        })}`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: ctx.abortSignal },
      )

      if (!calRes.ok) {
        return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not search calendar events." }
      }

      const delCalData = await calRes.json() as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }> }
      const delItems = delCalData.items || []
      if (delItems.length === 0) {
        return { toolName: name, status: "error", summary: "Event not found", output: `No event matching "${delSearchQuery}" found.` }
      }

      // BUG-006 fix: Disambiguate when multiple events match before deleting
      if (delItems.length > 1) {
        const listing = delItems.map((ev, i) => {
          const when = ev.start?.dateTime
            ? new Date(ev.start.dateTime).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : ev.start?.date || "unknown date"
          return `${i + 1}. "${ev.summary || "Untitled"}" on ${when}`
        }).join("\n")
        return {
          toolName: name,
          status: "done",
          summary: `Found ${delItems.length} matching events`,
          output: `I found ${delItems.length} events matching "${delSearchQuery}". Which one should I delete?\n\n${listing}\n\nPlease specify the event name more precisely.`,
        }
      }

      const delEvent = delItems[0]
      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${delEvent.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
          signal: ctx.abortSignal,
        },
      )

      if (!delRes.ok && delRes.status !== 204) {
        return { toolName: name, status: "error", summary: "Delete failed", output: "Could not delete the calendar event." }
      }

      return {
        toolName: name,
        status: "done",
        summary: `Deleted: "${delEvent.summary || "Event"}"`,
        output: `Event "${delEvent.summary || "Event"}" has been deleted from your calendar.`,
      }
    }

    case "findFreeSlot": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
      }

      let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
      if (!tokens) {
        return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
      }

      tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

      const slotDuration = Math.max(15, Math.min(Number(args.durationMinutes) || 60, 480))
      const daysAhead = Math.max(1, Math.min(Number(args.daysAhead) || 3, 7))
      const pref = String(args.preferredTimeRange || "any")

      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + daysAhead * 24 * 3_600_000).toISOString()

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        })}`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: ctx.abortSignal },
      )

      if (!calRes.ok) {
        return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not read calendar to find free slots." }
      }

      const calData = await calRes.json() as {
        items?: Array<{ start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }>
      }

      const busyIntervals: Array<{ start: number; end: number }> = (calData.items || [])
        .map((ev) => ({
          start: new Date(ev.start?.dateTime || ev.start?.date || "").getTime(),
          end: new Date(ev.end?.dateTime || ev.end?.date || "").getTime(),
        }))
        .filter((interval) => !isNaN(interval.start) && !isNaN(interval.end))
        .sort((a, b) => a.start - b.start)

      const freeSlots: string[] = []
      const slotMs = slotDuration * 60_000
      const prefRanges: Record<string, [number, number]> = {
        morning: [8, 12],
        afternoon: [12, 17],
        evening: [17, 21],
        any: [8, 21],
      }
      const [rangeStart, rangeEnd] = prefRanges[pref] || prefRanges.any

      for (let d = 0; d < daysAhead && freeSlots.length < 5; d++) {
        const dayStart = new Date()
        dayStart.setDate(dayStart.getDate() + d)
        dayStart.setHours(rangeStart, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(rangeEnd, 0, 0, 0)

        const now = Date.now()
        let cursor = Math.max(dayStart.getTime(), now)

        const mins = new Date(cursor).getMinutes()
        if (mins > 0 && mins < 30) cursor = new Date(cursor).setMinutes(30, 0, 0)
        else if (mins > 30) cursor = new Date(cursor).setMinutes(0, 0, 0) + 3_600_000

        while (cursor + slotMs <= dayEnd.getTime() && freeSlots.length < 5) {
          const slotEnd = cursor + slotMs
          const conflict = busyIntervals.some((busy) => cursor < busy.end && slotEnd > busy.start)
          if (!conflict) {
            const dt = new Date(cursor)
            freeSlots.push(
              dt.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            )
            cursor += slotMs
          } else {
            const blocking = busyIntervals.find((busy) => cursor < busy.end && slotEnd > busy.start)
            cursor = blocking ? blocking.end : cursor + 30 * 60_000
          }
        }
      }

      if (freeSlots.length === 0) {
        return {
          toolName: name,
          status: "done",
          summary: "No free slots",
          output: `No free ${slotDuration}-minute slots found in the next ${daysAhead} days during ${pref} hours.`,
        }
      }

      return {
        toolName: name,
        status: "done",
        summary: `Found ${freeSlots.length} free slots`,
        output: `Available ${slotDuration}-minute slots:\n${freeSlots.map((slot) => `  - ${slot}`).join("\n")}`,
      }
    }

    default:
      return null
  }
}
