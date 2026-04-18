import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueueTask,
  getTask,
  updateTask,
  addTaskStep,
  getTaskQueue,
  getUserTasks,
  getActiveTasks,
} from '@/lib/tasks/task-store'
import type { KVStore } from '@/types'
import type { BackgroundTask, TaskStep } from '@/lib/tasks/task-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockKV(): KVStore {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}

function makeTask(id: string, userId: string = 'user-1', status: BackgroundTask['status'] = 'pending'): BackgroundTask {
  return {
    id,
    userId,
    type: 'test-task',
    status,
    input: { test: true },
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
  }
}

const TASK_TTL = 86_400 // 24 hours

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getTaskQueue', () => {
  it('returns empty array when KV has no data', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    const queue = await getTaskQueue(kv, 'user-1')
    expect(queue).toEqual([])
    expect(kv.get).toHaveBeenCalledWith('task-queue:user-1')
  })

  it('returns parsed queue when data exists', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(['task-1', 'task-2']))

    const queue = await getTaskQueue(kv, 'user-1')
    expect(queue).toEqual(['task-1', 'task-2'])
  })

  it('returns empty array on invalid JSON', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue('invalid-json')

    const queue = await getTaskQueue(kv, 'user-1')
    expect(queue).toEqual([])
  })
})

describe('getTask', () => {
  it('returns null when task not found', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    const task = await getTask(kv, 'task-1')
    expect(task).toBeNull()
    expect(kv.get).toHaveBeenCalledWith('task:task-1')
  })

  it('returns parsed task when found', async () => {
    const kv = makeMockKV()
    const mockTask = makeTask('task-1')
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(mockTask))

    const task = await getTask(kv, 'task-1')
    expect(task).toEqual(mockTask)
  })

  it('returns null on invalid JSON', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue('invalid-json')

    const task = await getTask(kv, 'task-1')
    expect(task).toBeNull()
  })
})

describe('enqueueTask', () => {
  it('stores the task and adds it to the user queue', async () => {
    const kv = makeMockKV()
    // Mock getTaskQueue to return an empty queue
    vi.mocked(kv.get).mockResolvedValue(null)

    const task = makeTask('task-1', 'user-1')
    const resultId = await enqueueTask(kv, task)

    // Check task storage
    expect(kv.put).toHaveBeenCalledWith(
      'task:task-1',
      JSON.stringify(task),
      { expirationTtl: TASK_TTL }
    )

    // Check queue storage
    expect(kv.put).toHaveBeenCalledWith(
      'task-queue:user-1',
      JSON.stringify(['task-1']),
      { expirationTtl: TASK_TTL }
    )

    expect(resultId).toBe('task-1')
  })

  it('trims the queue to a maximum of 20 tasks', async () => {
    const kv = makeMockKV()
    // Mock getTaskQueue to return a queue with 20 tasks
    const existingQueue = Array.from({ length: 20 }, (_, i) => `task-${i}`)
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existingQueue))

    const task = makeTask('task-new', 'user-1')
    const resultId = await enqueueTask(kv, task)

    // The queue should now have the last 19 tasks from before + the new task
    const expectedQueue = [...existingQueue.slice(1), 'task-new']

    expect(kv.put).toHaveBeenCalledWith(
      'task-queue:user-1',
      JSON.stringify(expectedQueue),
      { expirationTtl: TASK_TTL }
    )
    expect(expectedQueue).toHaveLength(20)
    expect(resultId).toBe('task-new')
  })

  it('throws when kv.put throws an error', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)
    vi.mocked(kv.put).mockRejectedValue(new Error('KV Put Error'))

    const task = makeTask('task-error', 'user-1')
    await expect(enqueueTask(kv, task)).rejects.toThrow('KV Put Error')
  })
})

describe('updateTask', () => {
  it('does nothing if task not found', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    await updateTask(kv, 'task-1', { status: 'completed' })

    expect(kv.put).not.toHaveBeenCalled()
  })

  it('updates the task and sets updatedAt', async () => {
    const kv = makeMockKV()
    const task = makeTask('task-1')
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(task))

    const before = Date.now()
    await updateTask(kv, 'task-1', { status: 'completed', output: 'done' })

    const putCall = vi.mocked(kv.put).mock.calls[0]
    expect(putCall[0]).toBe('task:task-1')

    const updatedTask = JSON.parse(putCall[1] as string) as BackgroundTask
    expect(updatedTask.status).toBe('completed')
    expect(updatedTask.output).toBe('done')
    expect(updatedTask.updatedAt).toBeGreaterThanOrEqual(before)
    expect(putCall[2]).toEqual({ expirationTtl: TASK_TTL })
  })
})

describe('addTaskStep', () => {
  it('does nothing if task not found', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    const step: TaskStep = { toolName: 'test-tool', status: 'running', label: 'Testing' }
    await addTaskStep(kv, 'task-1', step)

    expect(kv.put).not.toHaveBeenCalled()
  })

  it('adds a new step if toolName does not exist', async () => {
    const kv = makeMockKV()
    const task = makeTask('task-1')
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(task))

    const step: TaskStep = { toolName: 'test-tool', status: 'running', label: 'Testing' }
    await addTaskStep(kv, 'task-1', step)

    const putCall = vi.mocked(kv.put).mock.calls[0]
    const updatedTask = JSON.parse(putCall[1] as string) as BackgroundTask
    expect(updatedTask.steps).toHaveLength(1)
    expect(updatedTask.steps[0]).toEqual(step)
  })

  it('updates an existing step if toolName matches', async () => {
    const kv = makeMockKV()
    const task = makeTask('task-1')
    const existingStep: TaskStep = { toolName: 'test-tool', status: 'running', label: 'Testing' }
    task.steps.push(existingStep)
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(task))

    const updatedStep: TaskStep = { toolName: 'test-tool', status: 'done', label: 'Testing done' }
    await addTaskStep(kv, 'task-1', updatedStep)

    const putCall = vi.mocked(kv.put).mock.calls[0]
    const updatedTask = JSON.parse(putCall[1] as string) as BackgroundTask
    expect(updatedTask.steps).toHaveLength(1)
    expect(updatedTask.steps[0]).toEqual(updatedStep)
  })
})

describe('getUserTasks', () => {
  it('returns all non-null tasks for a user', async () => {
    const kv = makeMockKV()
    const task1 = makeTask('task-1')
    const task3 = makeTask('task-3')

    // Mock get queue and then individual tasks
    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'task-queue:user-1') return JSON.stringify(['task-1', 'task-2', 'task-3'])
      if (key === 'task:task-1') return JSON.stringify(task1)
      if (key === 'task:task-2') return null // simulate deleted task
      if (key === 'task:task-3') return JSON.stringify(task3)
      return null
    })

    const tasks = await getUserTasks(kv, 'user-1')

    expect(tasks).toHaveLength(2)
    expect(tasks).toEqual([task1, task3])
  })
})

describe('getActiveTasks', () => {
  it('returns only pending or running tasks', async () => {
    const kv = makeMockKV()
    const pendingTask = makeTask('task-1', 'user-1', 'pending')
    const runningTask = makeTask('task-2', 'user-1', 'running')
    const completedTask = makeTask('task-3', 'user-1', 'completed')
    const failedTask = makeTask('task-4', 'user-1', 'failed')

    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'task-queue:user-1') return JSON.stringify(['task-1', 'task-2', 'task-3', 'task-4'])
      if (key === 'task:task-1') return JSON.stringify(pendingTask)
      if (key === 'task:task-2') return JSON.stringify(runningTask)
      if (key === 'task:task-3') return JSON.stringify(completedTask)
      if (key === 'task:task-4') return JSON.stringify(failedTask)
      return null
    })

    const tasks = await getActiveTasks(kv, 'user-1')

    expect(tasks).toHaveLength(2)
    expect(tasks.map(t => t.id)).toEqual(['task-1', 'task-2'])
  })
})
