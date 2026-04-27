import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { abortedToolResult, safeProviderError } from "@/lib/ai/agents/tools/shared"
import { lookupContact as lookupContactFromStore, saveContact as saveContactToStore } from "@/lib/contacts/contact-store"
import { stripHtml } from "@/lib/validation/sanitizer"

export async function executeCommunicationTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult | null> {
  const { name, args } = call
  const canSendEmail = ctx.executionSurface === "confirmed_agent"

  switch (name) {
    case "draftEmail": {
      const to = stripHtml(String(args.to || "")).slice(0, 200)
      const subject = stripHtml(String(args.subject || "")).slice(0, 150) || "No Subject"
      const body = stripHtml(String(args.body || "")).slice(0, 3000)

      const draft = `To: ${to}\nSubject: ${subject}\n\n${body}`

      return {
        toolName: name,
        status: "done",
        summary: `Draft ready: "${subject}"`,
        output: draft,
      }
    }

    case "sendEmail":
    case "confirmSendEmail": {
      if (!canSendEmail) {
        return {
          toolName: name,
          status: "error",
          summary: "Email requires confirmation",
          output: "Outbound email is disabled in this endpoint. Use the confirmation flow to send email.",
        }
      }

      const to = stripHtml(String(args.to || "")).slice(0, 200)
      const subject = stripHtml(String(args.subject || "")).slice(0, 150) || "No Subject"
      const body = stripHtml(String(args.body || "")).slice(0, 3000)
      const replyTo = args.replyTo ? stripHtml(String(args.replyTo)).slice(0, 200) : undefined

      if (!to || !to.includes("@")) {
        return { toolName: name, status: "error", summary: "Invalid email", output: "Please provide a valid recipient email address." }
      }

      const resendKey = ctx.resendApiKey
      if (!resendKey) {
        return { toolName: name, status: "error", summary: "Email not configured", output: "Email sending is not configured. Please add RESEND_API_KEY to the environment." }
      }

      const aborted = abortedToolResult(name, ctx)
      if (aborted) return aborted

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Missi <missi@missi.space>",
            to: [to],
            subject,
            text: body,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
          signal: ctx.abortSignal,
        })

        if (!emailRes.ok) {
          const errData = await emailRes.text().catch(() => "")
          return { toolName: name, status: "error", summary: "Email send failed", output: `Failed to send email: ${safeProviderError(errData)}` }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Email sent to ${to}`,
          output: `Email sent successfully to ${to} with subject "${subject}".`,
        }
      } catch (err) {
        return { toolName: name, status: "error", summary: "Email failed", output: `Error sending email: ${safeProviderError(err instanceof Error ? err.message : String(err))}` }
      }
    }

    case "lookupContact": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot look up contacts — storage is not connected." }
      }

      const contactName = String(args.name || "").trim()
      if (!contactName) {
        return { toolName: name, status: "error", summary: "No name", output: "Please provide a name to look up." }
      }

      const contact = await lookupContactFromStore(ctx.kv, ctx.userId, contactName)
      if (!contact) {
        return {
          toolName: name,
          status: "done",
          summary: `No contact found for "${contactName}"`,
          output: `No contact found matching "${contactName}". Ask the user for their email address and use saveContact to save it.`,
        }
      }

      return {
        toolName: name,
        status: "done",
        summary: `Found: ${contact.name} (${contact.email})`,
        output: `Contact found — Name: ${contact.name}, Email: ${contact.email}${contact.phone ? `, Phone: ${contact.phone}` : ""}${contact.relation ? `, Relation: ${contact.relation}` : ""}`,
      }
    }

    case "saveContact": {
      if (!ctx.kv) {
        return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot save contact — storage is not connected." }
      }

      const cName = stripHtml(String(args.name || "")).slice(0, 100)
      const cEmail = stripHtml(String(args.email || "")).slice(0, 200)
      if (!cName || !cEmail) {
        return { toolName: name, status: "error", summary: "Missing fields", output: "Both name and email are required to save a contact." }
      }

      const aborted = abortedToolResult(name, ctx)
      if (aborted) return aborted

      const saved = await saveContactToStore(ctx.kv, ctx.userId, {
        name: cName,
        email: cEmail,
        phone: args.phone ? String(args.phone).slice(0, 20) : undefined,
        relation: args.relation ? String(args.relation).slice(0, 50) : undefined,
      })

      return {
        toolName: name,
        status: "done",
        summary: `Contact saved: ${saved.name}`,
        output: `Contact saved — ${saved.name} (${saved.email})`,
      }
    }

    default:
      return null
  }
}
