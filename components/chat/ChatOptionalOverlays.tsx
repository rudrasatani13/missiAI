"use client"

import type { ActionResult } from "@/types/actions"
import { ActionCard } from "@/components/chat/ActionCard"
import { AgentSteps, type AgentStep } from "@/components/chat/AgentSteps"
import { DailyBriefBanner } from "@/components/chat/DailyBriefBanner"
import { OnboardingTour } from "@/components/chat/OnboardingTour"

interface ChatOptionalOverlaysProps {
  actionCopyEnabled: boolean
  agentSteps: AgentStep[]
  displayResult: ActionResult | null
  dismissOnboarding: () => void
  onActionCopy: () => void
  onDismissDisplay: () => void
  showOnboarding: boolean
}

export function ChatOptionalOverlays({
  actionCopyEnabled,
  agentSteps,
  displayResult,
  dismissOnboarding,
  onActionCopy,
  onDismissDisplay,
  showOnboarding,
}: ChatOptionalOverlaysProps) {
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 z-[200] p-3 md:p-4 pointer-events-auto"
        style={{ maxWidth: 600, margin: "0 auto" }}
      >
        <DailyBriefBanner />
      </div>

      {showOnboarding && (
        <OnboardingTour onComplete={dismissOnboarding} />
      )}

      {displayResult && (
        <div
          className="absolute bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"
          data-testid="action-card-container"
        >
          <ActionCard
            result={displayResult}
            onDismiss={onDismissDisplay}
            onCopy={actionCopyEnabled ? onActionCopy : undefined}
          />
        </div>
      )}

      {agentSteps.length > 0 && (
        <div className="absolute bottom-48 md:bottom-52 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <AgentSteps steps={agentSteps} />
        </div>
      )}
    </>
  )
}
