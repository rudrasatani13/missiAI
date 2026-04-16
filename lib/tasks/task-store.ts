/**
 * KV-Based Task Store
 *
 * CRUD operations for background tasks stored in Cloudflare KV.
 * Tasks have a 24-hour TTL and are scoped per user.
 */

import type { KVStore } from "@/types"
import type { BackgroundTask, TaskStatus, TaskStep } from "./task-types"

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_TTL = 86_400 // 24 hours
const MAX_TASKS_PER_USER = 20
const TASK_PREFIX = "task"
const QUEUE_PREFIX = "task-queue"

function taskKey(taskId: string): string {
  return `${TASK_PREFIX}:${taskId}`
}

function queueKey(userId: string): string {
  return `${QUEUE_PREFIX}:${userId}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createTask(
  kv: KVStore,
  task: BackgroundTask,
): Promise<void> {
  // Store the task
  await kv.put(taskKey(task.id), JSON.stringify(task), { expirationTtl: TASK_TTL })

  // Add to user's queue
  const queue = await getTaskQueue(kv, task.userId)
  queue.push(task.id)
  // Trim old tasks
  const trimmed = queue.slice(-MAX_TASKS_PER_USER)
  await kv.put(queueKey(task.userId), JSON.stringify(trimmed), { expirationTtl: TASK_TTL })
}

export async function getTask(
  kv: KVStore,
  taskId: string,
): Promise<BackgroundTask | null> {
  try {
    const raw = await kv.get(taskKey(taskId))
    if (!raw) return null
    return JSON.parse(raw) as BackgroundTask
  } catch {
    return null
  }
}

export async function updateTask(
  kv: KVStore,
  taskId: string,
  updates: Partial<Pick<BackgroundTask, "status" | "output" | "error" | "steps" | "completedAt">>,
): Promise<void> {
  const task = await getTask(kv, taskId)
  if (!task) return

  const updated: BackgroundTask = {
    ...task,
    ...updates,
    updatedAt: Date.now(),
  }
  await kv.put(taskKey(taskId), JSON.stringify(updated), { expirationTtl: TASK_TTL })
}

export async function addTaskStep(
  kv: KVStore,
  taskId: string,
  step: TaskStep,
): Promise<void> {
  const task = await getTask(kv, taskId)
  if (!task) return

  const existingIdx = task.steps.findIndex(s => s.toolName === step.toolName)
  if (existingIdx >= 0) {
    task.steps[existingIdx] = step
  } else {
    task.steps.push(step)
  }

  task.updatedAt = Date.now()
  await kv.put(taskKey(taskId), JSON.stringify(task), { expirationTtl: TASK_TTL })
}

export async function getTaskQueue(
  kv: KVStore,
  userId: string,
): Promise<string[]> {
  try {
    const raw = await kv.get(queueKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

export async function getUserTasks(
  kv: KVStore,
  userId: string,
): Promise<BackgroundTask[]> {
  const queue = await getTaskQueue(kv, userId)
  const tasks: BackgroundTask[] = []

  for (const taskId of queue) {
    const task = await getTask(kv, taskId)
    if (task) tasks.push(task)
  }

  return tasks
}

export async function getActiveTasks(
  kv: KVStore,
  userId: string,
): Promise<BackgroundTask[]> {
  const tasks = await getUserTasks(kv, userId)
  return tasks.filter(t => t.status === "pending" || t.status === "running")
}
