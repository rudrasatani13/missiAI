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
