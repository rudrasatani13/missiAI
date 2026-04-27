function toUrl(input: string | URL): URL {
  return input instanceof URL ? input : new URL(input)
}

export function syncWorkerStringBindingsToProcessEnv(env: unknown): void {
  const cfEnv = env as Record<string, unknown>
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env
  if (!processEnv) return

  for (const [k, v] of Object.entries(cfEnv)) {
    if (typeof v === "string" && !processEnv[k]) processEnv[k] = v
  }
}

export function isLiveRelayRequest(requestUrl: string | URL): boolean {
  return toUrl(requestUrl).pathname === "/api/v1/voice-relay"
}
