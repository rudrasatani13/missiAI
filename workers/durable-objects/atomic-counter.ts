type PlanId = 'free' | 'plus' | 'pro'

interface KVBinding {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}

interface DurableObjectStateLike {
  storage: DurableObjectStorage
}

interface CounterRecord {
  count: number
  expiresAt: number
}

interface VoiceRecord {
  userId: string
  date: string
  voiceInteractions: number
  voiceSecondsUsed: number
  lastUpdatedAt: number
  expiresAt: number
}

interface WorkerEnv {
  MISSI_MEMORY?: KVBinding
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export class AtomicCounterDO {
  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: WorkerEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    let body: Record<string, unknown>

    try {
      body = await request.json() as Record<string, unknown>
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }

    if (url.pathname === '/counter/check-increment') {
      return this.handleCounterCheckAndIncrement(body)
    }

    if (url.pathname === '/counter/check') {
      return this.handleCounterCheck(body)
    }

    if (url.pathname === '/counter/decrement') {
      return this.handleCounterDecrement(body)
    }

    if (url.pathname === '/voice/check') {
      return this.handleVoiceCheck(body)
    }

    if (url.pathname === '/voice/check-increment') {
      return this.handleVoiceCheckAndIncrement(body)
    }

    return jsonResponse({ error: 'Not found' }, 404)
  }

  private async readCounterRecord(): Promise<CounterRecord> {
    const now = Date.now()
    const stored = await this.state.storage.get<CounterRecord>('counter')
    if (!stored || stored.expiresAt <= now) {
      return { count: 0, expiresAt: 0 }
    }
    return stored
  }

  private async readVoiceRecord(userId: string, date: string): Promise<VoiceRecord> {
    const now = Date.now()
    const stored = await this.state.storage.get<VoiceRecord>('voice')
    if (!stored || stored.expiresAt <= now) {
      return {
        userId,
        date,
        voiceInteractions: 0,
        voiceSecondsUsed: 0,
        lastUpdatedAt: now,
        expiresAt: 0,
      }
    }
    return stored
  }

  private async mirrorVoiceRecord(record: VoiceRecord, ttlSeconds: number): Promise<void> {
    if (!this.env.MISSI_MEMORY) return

    const payload = {
      userId: record.userId,
      date: record.date,
      voiceInteractions: record.voiceInteractions,
      voiceSecondsUsed: record.voiceSecondsUsed,
      lastUpdatedAt: record.lastUpdatedAt,
    }

    await this.env.MISSI_MEMORY.put(
      `usage:${record.userId}:${record.date}`,
      JSON.stringify(payload),
      { expirationTtl: ttlSeconds },
    )
  }

  private voiceResult(record: VoiceRecord, planId: PlanId, limitSeconds: number) {
    const allowed = planId === 'pro' || record.voiceSecondsUsed < limitSeconds
    return {
      allowed,
      usedSeconds: record.voiceSecondsUsed,
      limitSeconds,
      remainingSeconds: planId === 'pro' ? 999999 : Math.max(0, limitSeconds - record.voiceSecondsUsed),
      voiceInteractions: record.voiceInteractions,
    }
  }

  private async handleCounterCheckAndIncrement(body: Record<string, unknown>): Promise<Response> {
    const limit = Number(body.limit)
    const ttlSeconds = Number(body.ttlSeconds)
    if (!Number.isFinite(limit) || !Number.isFinite(ttlSeconds) || limit < 0 || ttlSeconds <= 0) {
      return jsonResponse({ error: 'Invalid counter input' }, 400)
    }

    const now = Date.now()
    const record = await this.readCounterRecord()
    if (record.count >= limit) {
      return jsonResponse({ allowed: false, count: record.count, remaining: 0 })
    }

    const nextRecord: CounterRecord = {
      count: record.count + 1,
      expiresAt: now + ttlSeconds * 1000,
    }
    await this.state.storage.put('counter', nextRecord)

    return jsonResponse({
      allowed: true,
      count: nextRecord.count,
      remaining: Math.max(0, limit - nextRecord.count),
    })
  }

  private async handleCounterCheck(body: Record<string, unknown>): Promise<Response> {
    const limit = Number(body.limit)
    if (!Number.isFinite(limit) || limit < 0) {
      return jsonResponse({ error: 'Invalid counter input' }, 400)
    }

    const record = await this.readCounterRecord()
    return jsonResponse({
      allowed: record.count < limit,
      count: record.count,
      remaining: Math.max(0, limit - record.count),
    })
  }

  private async handleCounterDecrement(body: Record<string, unknown>): Promise<Response> {
    const limit = Number(body.limit)
    const amount = Number(body.amount ?? 1)
    if (!Number.isFinite(limit) || !Number.isFinite(amount) || limit < 0 || amount <= 0) {
      return jsonResponse({ error: 'Invalid counter input' }, 400)
    }

    const now = Date.now()
    const record = await this.readCounterRecord()
    const nextCount = Math.max(0, record.count - amount)
    if (record.expiresAt > now) {
      await this.state.storage.put('counter', { ...record, count: nextCount })
    }

    return jsonResponse({
      allowed: nextCount < limit,
      count: nextCount,
      remaining: Math.max(0, limit - nextCount),
    })
  }

  private async handleVoiceCheck(body: Record<string, unknown>): Promise<Response> {
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const date = typeof body.date === 'string' ? body.date : ''
    const planId = (body.planId === 'plus' || body.planId === 'pro' ? body.planId : 'free') as PlanId
    const limitSeconds = Number(body.limitSeconds)

    if (!userId || !date || !Number.isFinite(limitSeconds) || limitSeconds < 0) {
      return jsonResponse({ error: 'Invalid voice input' }, 400)
    }

    const record = await this.readVoiceRecord(userId, date)
    return jsonResponse(this.voiceResult(record, planId, limitSeconds))
  }

  private async handleVoiceCheckAndIncrement(body: Record<string, unknown>): Promise<Response> {
    const userId = typeof body.userId === 'string' ? body.userId : ''
    const date = typeof body.date === 'string' ? body.date : ''
    const planId = (body.planId === 'plus' || body.planId === 'pro' ? body.planId : 'free') as PlanId
    const limitSeconds = Number(body.limitSeconds)
    const addSeconds = Number(body.addSeconds)
    const ttlSeconds = Number(body.ttlSeconds)

    if (!userId || !date || !Number.isFinite(limitSeconds) || !Number.isFinite(addSeconds) || !Number.isFinite(ttlSeconds) || limitSeconds < 0 || addSeconds < 0 || ttlSeconds <= 0) {
      return jsonResponse({ error: 'Invalid voice input' }, 400)
    }

    const now = Date.now()
    const record = await this.readVoiceRecord(userId, date)
    if (planId !== 'pro' && record.voiceSecondsUsed >= limitSeconds) {
      return jsonResponse(this.voiceResult(record, planId, limitSeconds))
    }

    const nextRecord: VoiceRecord = {
      userId,
      date,
      voiceInteractions: record.voiceInteractions + 1,
      voiceSecondsUsed: record.voiceSecondsUsed + addSeconds,
      lastUpdatedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    }

    await this.state.storage.put('voice', nextRecord)
    await this.mirrorVoiceRecord(nextRecord, ttlSeconds)

    return jsonResponse(this.voiceResult(nextRecord, planId, limitSeconds))
  }
}
