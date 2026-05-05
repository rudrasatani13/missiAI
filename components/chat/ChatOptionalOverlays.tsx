"use client"

import { OnboardingTour } from "@/components/chat/OnboardingTour"
import type { PluginResult } from "@/types/plugins"

interface ChatOptionalOverlaysProps {
  dismissOnboarding: () => void
  onDismissDisplay: () => void
  pluginResult: PluginResult | null
  showOnboarding: boolean
}

export function ChatOptionalOverlays({
  dismissOnboarding,
  onDismissDisplay,
  pluginResult,
  showOnboarding,
}: ChatOptionalOverlaysProps) {
  return (
    <>
      {showOnboarding && (
        <OnboardingTour onComplete={dismissOnboarding} />
      )}

      {pluginResult && (
        <div
          className="absolute bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"
          data-testid="plugin-result-container"
        >
          <div className="pointer-events-auto w-max min-w-[280px] max-w-[380px] rounded-[14px] border border-[var(--missi-border)] bg-[var(--missi-border)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[var(--missi-text-secondary)]">
                {pluginResult.pluginId}
              </span>
              <button
                type="button"
                onClick={onDismissDisplay}
                aria-label="Dismiss plugin result"
                className="text-sm text-[var(--missi-text-muted)] transition-colors hover:text-[var(--missi-text-secondary)]"
              >
                ×
              </button>
            </div>
            <p className="m-0 break-words text-[13px] leading-normal text-[var(--missi-text-secondary)]">
              {pluginResult.output}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
