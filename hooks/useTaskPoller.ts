"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { BackgroundTask } from "@/lib/tasks/task-types"

const POLL_INTERVAL = 5000 // 5 seconds

export interface UseTaskPollerOptions {
  /** Callback when a task completes — used to trigger TTS for the result */
  onTaskComplete?: (task: BackgroundTask) => void
  /** Whether polling is enabled */
  enabled?: boolean
}

export function useTaskPoller(options: UseTaskPollerOptions = {}) {
  const { onTaskComplete, enabled = true } = options
  const [tasks, setTasks] = useState<BackgroundTask[]>([])
  const [hasActive, setHasActive] = useState(false)
  const completedIdsRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/tasks")
      if (!res.ok) return

      const data = await res.json() as { tasks: BackgroundTask[]; hasActive: boolean }
      setTasks(data.tasks)
      setHasActive(data.hasActive)

      // Check for newly completed tasks
      for (const task of data.tasks) {
        if (
          (task.status === "completed" || task.status === "failed") &&
          !completedIdsRef.current.has(task.id)
        ) {
          completedIdsRef.current.add(task.id)
          if (task.status === "completed" && onTaskComplete) {
            onTaskComplete(task)
          }
        }
      }
    } catch {
      // Silently fail — non-critical
    }
  }, [onTaskComplete])

  useEffect(() => {
    if (!enabled) return

    // Initial poll
    poll()

    // Set up polling interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, poll])

  return {
    tasks,
    hasActive,
    refetch: poll,
  }
}
