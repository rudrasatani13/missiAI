import { PERSONALITY_OPTIONS, type PersonalityKey } from "@/types/chat"

export interface ChatMemoryNodePreview {
  category: string
  title: string
  detail: string
}

export function isChatSetupComplete(remoteSetupComplete: boolean | undefined, hasLocalSetupComplete: boolean): boolean {
  return Boolean(remoteSetupComplete) || hasLocalSetupComplete
}

export function getBootFlowState(isNewUser: boolean, hasSeenBoot: boolean): { showBootSequence: boolean; bootCompleted: boolean } {
  if (isNewUser || !hasSeenBoot) {
    return { showBootSequence: true, bootCompleted: false }
  }

  return { showBootSequence: false, bootCompleted: true }
}

export function formatMemoryNodesForChat(nodes: ChatMemoryNodePreview[]): string {
  return nodes
    .map((node) => `${node.category}: ${node.title} — ${node.detail}`)
    .join("\n")
}

export function getTierSafePersonality(personality: PersonalityKey, planId: string | null | undefined): PersonalityKey {
  const personalityOption = PERSONALITY_OPTIONS.find((option) => option.key === personality)
  if (!personalityOption) {
    return "assistant"
  }

  const isPremium = personalityOption.requiredPlan === "plus" || personalityOption.requiredPlan === "pro"
  const isLocked = isPremium && (!planId || planId === "free")

  return isLocked ? "assistant" : personality
}

export function getAvatarFetchDelayMs(isFullDevBootstrap: boolean): number {
  return isFullDevBootstrap ? 0 : 6000
}
