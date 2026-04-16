/**
 * Background Task Types
 *
 * Defines the shape of background tasks stored in KV.
 * Tasks represent long-running agent operations that outlive a single HTTP request.
 */

export type TaskStatus = "pending" | "running" | "completed" | "failed"

export interface TaskStep {
  toolName: string
  status: "running" | "done" | "error"
  label: string
  summary?: string
}

export interface BackgroundTask {
  id: string
  userId: string
  type: string
  status: TaskStatus
  input: Record<string, unknown>
  output?: string
  error?: string
  steps: TaskStep[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface TaskListResponse {
  tasks: BackgroundTask[]
  hasActive: boolean
}
