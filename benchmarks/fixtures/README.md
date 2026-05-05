# Fixtures

Add future benchmark fixtures here so provider-backed and auth-sensitive flows can be measured without production secrets.

Recommended layout:

- `chat/`: request bodies, mocked SSE payloads, auth context builders
- `memory/`: graph fixtures, vector search stubs, extraction payloads
- `voice/`: STT/TTS inputs, live relay session mocks
- `billing/`: checkout and webhook fixtures
- `plugins/`: connected plugin configs, OAuth callback payloads, tool execution mocks

Each fixture module can export `fixture` or `default` with the shape expected by `server-function-benchmark.ts`:

```ts
export const fixture = {
  beforeAll: async () => {},
  beforeEach: async () => {},
  createArgs: async () => [],
  validateResult: async (_result: unknown) => {},
  afterEach: async () => {},
  afterAll: async () => {},
}
```

Keep fixtures deterministic, scrubbed, and free of live secrets.
