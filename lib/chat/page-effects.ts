import type { ConversationEntry, VoiceState } from "@/types/chat"
import type { PluginConfig, PluginId } from "@/types/plugins"

export function shouldHandleChatHotkey(event: KeyboardEvent): boolean {
  return event.code === "Space" && event.target === document.body
}

export function getGreetingMessage(displayName: string, isNewUser: boolean): { message: string; delayMs: number } {
  if (isNewUser) {
    return {
      message: `Hello ${displayName}, nice to finally meet you! Let's get started.`,
      delayMs: 2000,
    }
  }

  const greetings = [
    `Hey${displayName ? ` ${displayName}` : ""}! What's up, how's it going?`,
    `Hey${displayName ? ` ${displayName}` : ""}! Good to see you, what can I help with?`,
    `Hey${displayName ? ` ${displayName}` : ""}! How are you doing today?`,
  ]

  return {
    message: greetings[Math.floor(Math.random() * greetings.length)],
    delayMs: 1200,
  }
}

export function shouldTrackLastInteraction(voiceState: VoiceState): boolean {
  return voiceState === "recording"
}

export function buildRecentConversationContext(conversation: ConversationEntry[]): string {
  return conversation
    .slice(-6)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n")
}

export function getConnectedPluginIds(plugins: Array<Pick<PluginConfig, "id" | "status">>): PluginId[] {
  return plugins
    .filter((plugin) => plugin.status === "connected")
    .map((plugin) => plugin.id as PluginId)
}
