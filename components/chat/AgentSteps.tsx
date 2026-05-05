"use client"

import { motion, AnimatePresence } from "framer-motion"

export interface AgentStep {
  toolName: string
  status: string // "running" | "done" | "error"
  label: string
  summary?: string
}

interface AgentStepsProps {
  steps: AgentStep[]
}

/**
 * Minimal, text-only agent step visualizer.
 * Shows what Missi is doing autonomously — no emojis, no icons.
 * Appears above the voice button during agentic workflows.
 */
export function AgentSteps({ steps }: AgentStepsProps) {
  if (steps.length === 0) return null

  return (
    <div className="w-full max-w-md mx-auto mb-6 pointer-events-none">
      <AnimatePresence mode="sync">
        {steps.map((step, i) => (
          <motion.div
            key={`${step.toolName}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-3 mb-2"
          >
            {/* Pulsing dot indicator */}
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  step.status === "running"
                    ? "var(--missi-text-secondary)"
                    : step.status === "done"
                    ? "var(--missi-text-muted)"
                    : "rgba(239,68,68,0.6)",
                animation:
                  step.status === "running"
                    ? "pulse 1.5s ease-in-out infinite"
                    : "none",
              }}
            />

            {/* Step label */}
            <span
              className="text-xs tracking-wide"
              style={{
                color:
                  step.status === "running"
                    ? "var(--missi-text-secondary)"
                    : step.status === "done"
                    ? "var(--missi-text-muted)"
                    : "rgba(239,68,68,0.5)",
                fontFamily: "var(--font-body)",
              }}
            >
              {step.label}
              {step.status === "running" && (
                <span className="tracking-widest animate-pulse">...</span>
              )}
              {step.status === "done" && step.summary && (
                <span style={{ color: "var(--missi-text-muted)", marginLeft: 6 }}>
                  — {step.summary}
                </span>
              )}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
