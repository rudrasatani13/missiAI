import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  verifyWhatsAppSignatureMock,
  sendWhatsAppMessageMock,
  resolveClerkUserFromPhoneMock,
  storeWhatsAppMappingMock,
  checkPlanGateMock,
  checkAndIncrementBotDailyLimitMock,
  isMessageDuplicateMock,
  markMessageProcessedMock,
  consumePendingWhatsAppLinkMock,
  checkAndIncrementWaLinkAttemptMock,
  processBotMessageMock,
  getCloudflareKVBindingMock,
  getCloudflareVectorizeEnvMock,
  getCloudflareExecutionContextMock,
  logSecurityEventMock,
  logApiErrorMock,
  logMock,
} = vi.hoisted(() => ({
  verifyWhatsAppSignatureMock: vi.fn(),
  sendWhatsAppMessageMock: vi.fn(),
  resolveClerkUserFromPhoneMock: vi.fn(),
  storeWhatsAppMappingMock: vi.fn(),
  checkPlanGateMock: vi.fn(),
  checkAndIncrementBotDailyLimitMock: vi.fn(),
  isMessageDuplicateMock: vi.fn(),
  markMessageProcessedMock: vi.fn(),
  consumePendingWhatsAppLinkMock: vi.fn(),
  checkAndIncrementWaLinkAttemptMock: vi.fn(),
  processBotMessageMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  getCloudflareVectorizeEnvMock: vi.fn(),
  getCloudflareExecutionContextMock: vi.fn(),
  logSecurityEventMock: vi.fn(),
  logApiErrorMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@/lib/bot/whatsapp-client', () => ({
  verifyWhatsAppSignature: verifyWhatsAppSignatureMock,
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}))

vi.mock('@/lib/bot/bot-auth', () => ({
  resolveClerkUserFromPhone: resolveClerkUserFromPhoneMock,
  storeWhatsAppMapping: storeWhatsAppMappingMock,
  checkPlanGate: checkPlanGateMock,
  checkAndIncrementBotDailyLimit: checkAndIncrementBotDailyLimitMock,
  isMessageDuplicate: isMessageDuplicateMock,
  markMessageProcessed: markMessageProcessedMock,
  consumePendingWhatsAppLink: consumePendingWhatsAppLinkMock,
  checkAndIncrementWaLinkAttempt: checkAndIncrementWaLinkAttemptMock,
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

import { POST } from '@/app/api/webhooks/whatsapp/route'

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

function makePayload(text = 'hello', messageId = 'wamid.1') {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: messageId,
            from: '+15551234567',
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: text },
          }],
        },
      }],
    }],
  }
}

function makeRequest(body: unknown) {
  return new Request('https://missi.space/api/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=valid', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('whatsapp webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyWhatsAppSignatureMock.mockResolvedValue(true)
    sendWhatsAppMessageMock.mockResolvedValue(undefined)
    resolveClerkUserFromPhoneMock.mockResolvedValue('user_123')
    storeWhatsAppMappingMock.mockResolvedValue(undefined)
    checkPlanGateMock.mockResolvedValue({ allowed: true, planId: 'pro' })
    checkAndIncrementBotDailyLimitMock.mockResolvedValue({ allowed: true, count: 1 })
    isMessageDuplicateMock.mockResolvedValue(false)
    markMessageProcessedMock.mockResolvedValue(undefined)
    consumePendingWhatsAppLinkMock.mockResolvedValue(null)
    checkAndIncrementWaLinkAttemptMock.mockResolvedValue({ allowed: true, attempts: 1 })
    processBotMessageMock.mockResolvedValue('AI reply')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getCloudflareVectorizeEnvMock.mockReturnValue(null)
    getCloudflareExecutionContextMock.mockReturnValue(null)
  })

  it('rejects payloads exceeding the 64 KB body size limit with 413 before signature check', async () => {
    const bigBody = 'x'.repeat(64 * 1024 + 1)
    const req = new Request('https://missi.space/api/webhooks/whatsapp', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=valid', 'content-type': 'application/octet-stream' },
      body: bigBody,
    })

    const res = await POST(req)

    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({ received: false, error: 'Payload too large' })
    expect(verifyWhatsAppSignatureMock).not.toHaveBeenCalled()
    expect(processBotMessageMock).not.toHaveBeenCalled()
  })

  it('rejects invalid signatures before processing', async () => {
    verifyWhatsAppSignatureMock.mockResolvedValueOnce(false)

    const res = await POST(makeRequest(makePayload()))

    expect(res.status).toBe(401)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(processBotMessageMock).not.toHaveBeenCalled()
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.bot.wa.invalid_signature',
      expect.objectContaining({ path: '/api/webhooks/whatsapp' }),
    )
  })

  it('ignores malformed WhatsApp payloads after logging validation failure', async () => {
    const res = await POST(makeRequest({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.invalid' }],
          },
        }],
      }],
    }))

    expect(res.status).toBe(200)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(processBotMessageMock).not.toHaveBeenCalled()
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.bot.wa.invalid_payload',
      expect.objectContaining({ path: '/api/webhooks/whatsapp' }),
    )
  })

  it('marks a message processed only after a successful main reply', async () => {
    const res = await POST(makeRequest(makePayload('hello', 'wamid.2')))

    expect(res.status).toBe(200)
    expect(processBotMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_123',
      messageText: 'hello',
      platform: 'whatsapp',
    }))
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith('+15551234567', 'AI reply')
    expect(markMessageProcessedMock).toHaveBeenCalledWith(kv, 'whatsapp', 'wamid.2')
    expect(sendWhatsAppMessageMock.mock.invocationCallOrder[0]).toBeLessThan(
      markMessageProcessedMock.mock.invocationCallOrder[0],
    )
  })

  it('does not mark a message processed when the main reply fails', async () => {
    sendWhatsAppMessageMock
      .mockRejectedValueOnce(new Error('whatsapp down'))
      .mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest(makePayload('hello', 'wamid.3')))

    expect(res.status).toBe(200)
    expect(markMessageProcessedMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      event: 'bot.wa.reply_failed',
      metadata: expect.objectContaining({ messageId: 'wamid.3', branch: 'main_reply' }),
    }))
  })
})
