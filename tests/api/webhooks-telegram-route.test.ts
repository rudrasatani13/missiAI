import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  verifyTelegramSecretMock,
  sendTelegramMessageMock,
  resolveClerkUserFromTelegramIdMock,
  storeTelegramMappingMock,
  checkPlanGateMock,
  checkAndIncrementBotDailyLimitMock,
  isMessageDuplicateMock,
  markMessageProcessedMock,
  consumeTelegramLinkCodeMock,
  checkAndIncrementTgLinkAttemptMock,
  processBotMessageMock,
  getCloudflareKVBindingMock,
  getCloudflareVectorizeEnvMock,
  getCloudflareExecutionContextMock,
  logSecurityEventMock,
  logApiErrorMock,
  logMock,
} = vi.hoisted(() => ({
  verifyTelegramSecretMock: vi.fn(),
  sendTelegramMessageMock: vi.fn(),
  resolveClerkUserFromTelegramIdMock: vi.fn(),
  storeTelegramMappingMock: vi.fn(),
  checkPlanGateMock: vi.fn(),
  checkAndIncrementBotDailyLimitMock: vi.fn(),
  isMessageDuplicateMock: vi.fn(),
  markMessageProcessedMock: vi.fn(),
  consumeTelegramLinkCodeMock: vi.fn(),
  checkAndIncrementTgLinkAttemptMock: vi.fn(),
  processBotMessageMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  getCloudflareVectorizeEnvMock: vi.fn(),
  getCloudflareExecutionContextMock: vi.fn(),
  logSecurityEventMock: vi.fn(),
  logApiErrorMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/bot/telegram-client', () => ({
  verifyTelegramSecret: verifyTelegramSecretMock,
  sendTelegramMessage: sendTelegramMessageMock,
}))

vi.mock('@/lib/bot/bot-auth', () => ({
  resolveClerkUserFromTelegramId: resolveClerkUserFromTelegramIdMock,
  storeTelegramMapping: storeTelegramMappingMock,
  checkPlanGate: checkPlanGateMock,
  checkAndIncrementBotDailyLimit: checkAndIncrementBotDailyLimitMock,
  isMessageDuplicate: isMessageDuplicateMock,
  markMessageProcessed: markMessageProcessedMock,
  consumeTelegramLinkCode: consumeTelegramLinkCodeMock,
  checkAndIncrementTgLinkAttempt: checkAndIncrementTgLinkAttemptMock,
}))

vi.mock('@/lib/bot/bot-pipeline', () => ({
  processBotMessage: processBotMessageMock,
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
  getCloudflareVectorizeEnv: getCloudflareVectorizeEnvMock,
  getCloudflareExecutionContext: getCloudflareExecutionContextMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logSecurityEvent: logSecurityEventMock,
  logApiError: logApiErrorMock,
  log: logMock,
}))

import { POST } from '@/app/api/webhooks/telegram/route'

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

function makeUpdate(text = 'hello', updateId = 101) {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      chat: { id: 222 },
      from: { id: 333 },
      text,
    },
  }
}

function makeRequest(body: unknown, secret = 'valid-secret') {
  return new Request('https://missi.space/api/webhooks/telegram', {
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('telegram webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyTelegramSecretMock.mockResolvedValue(true)
    sendTelegramMessageMock.mockResolvedValue(undefined)
    resolveClerkUserFromTelegramIdMock.mockResolvedValue('user_123')
    storeTelegramMappingMock.mockResolvedValue(undefined)
    checkPlanGateMock.mockResolvedValue({ allowed: true, planId: 'pro' })
    checkAndIncrementBotDailyLimitMock.mockResolvedValue({ allowed: true, count: 1 })
    isMessageDuplicateMock.mockResolvedValue(false)
    markMessageProcessedMock.mockResolvedValue(undefined)
    consumeTelegramLinkCodeMock.mockResolvedValue(null)
    checkAndIncrementTgLinkAttemptMock.mockResolvedValue({ allowed: true, attempts: 1 })
    processBotMessageMock.mockResolvedValue('AI reply')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getCloudflareVectorizeEnvMock.mockReturnValue(null)
    getCloudflareExecutionContextMock.mockReturnValue(null)
  })

  it('rejects requests with an invalid Telegram secret before processing', async () => {
    verifyTelegramSecretMock.mockResolvedValueOnce(false)

    const res = await POST(makeRequest(makeUpdate()))

    expect(res.status).toBe(401)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(processBotMessageMock).not.toHaveBeenCalled()
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.bot.tg.invalid_secret',
      expect.objectContaining({ path: '/api/webhooks/telegram' }),
    )
  })

  it('ignores malformed Telegram payloads after logging validation failure', async () => {
    const res = await POST(makeRequest({ update_id: 'not-a-number' }))

    expect(res.status).toBe(200)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(processBotMessageMock).not.toHaveBeenCalled()
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.bot.tg.invalid_payload',
      expect.objectContaining({ path: '/api/webhooks/telegram' }),
    )
  })

  it('marks an update processed only after a successful main reply', async () => {
    const res = await POST(makeRequest(makeUpdate('hello', 202)))

    expect(res.status).toBe(200)
    expect(processBotMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_123',
      messageText: 'hello',
      platform: 'telegram',
    }))
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(222, 'AI reply')
    expect(markMessageProcessedMock).toHaveBeenCalledWith(kv, 'telegram', 202)
    expect(sendTelegramMessageMock.mock.invocationCallOrder[0]).toBeLessThan(
      markMessageProcessedMock.mock.invocationCallOrder[0],
    )
  })

  it('does not mark an update processed when the main reply fails', async () => {
    sendTelegramMessageMock
      .mockRejectedValueOnce(new Error('telegram down'))
      .mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest(makeUpdate('hello', 303)))

    expect(res.status).toBe(200)
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      event: 'bot.tg.reply_failed',
      metadata: expect.objectContaining({ updateId: 303, branch: 'main_reply' }),
    }))
  })

  it('rejects payloads exceeding the 64 KB body size limit with 413 after auth', async () => {
    const bigBody = 'x'.repeat(64 * 1024 + 1)
    const req = new Request('https://missi.space/api/webhooks/telegram', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'valid-secret', 'content-type': 'application/octet-stream' },
      body: bigBody,
    })

    const res = await POST(req)

    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ received: false, error: 'Payload too large' })
    expect(processBotMessageMock).not.toHaveBeenCalled()
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
  })

  it('throttles Telegram link-code attempts before consuming a code', async () => {
    checkAndIncrementTgLinkAttemptMock.mockResolvedValueOnce({ allowed: false, attempts: 10 })

    const res = await POST(makeRequest(makeUpdate('/start 123456', 404)))

    expect(res.status).toBe(200)
    expect(checkAndIncrementTgLinkAttemptMock).toHaveBeenCalledWith(kv, 333, expect.any(String))
    expect(consumeTelegramLinkCodeMock).not.toHaveBeenCalled()
    expect(storeTelegramMappingMock).not.toHaveBeenCalled()
    expect(markMessageProcessedMock).toHaveBeenCalledWith(kv, 'telegram', 404)
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.bot.tg.link_attempts_exceeded',
      expect.objectContaining({ path: '/api/webhooks/telegram' }),
    )
  })
})
