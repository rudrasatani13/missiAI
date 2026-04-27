# CODEBASE AUDIT REPORT

Scope note: I completed the audit **excluding** `.env.local`, `.env.development.local`, `.env.production.local`, and `service-account.json` because workspace protections blocked direct reads of those gitignored local secret files.

## 1. Runtime Exceptions & Logic Bugs

Status update — 2026-04-27: **Phase 1 completed.** The four Phase 1 findings in this section have now been remediated and validated with focused regressions and a clean `pnpm exec tsc --noEmit --pretty false` run. Specifically: streamed assistant output now preserves a full-session transcript across tool loops in `lib/server/chat/stream-runner.ts`; chat voice quota charging is now gated on actual `voiceDurationMs` presence in both `lib/server/chat/stream-preflight.ts` and `lib/server/chat/route-preflight.ts`; and `app/api/v1/health/route.ts` now uses the durable object's read-only `/counter/check` probe. The original findings are retained below as the historical audit record.

- **[ `lib/server/chat/stream-runner.ts:95-96` ]** — The runner stores streamed assistant text in `fullResponse`, but this value is reused across tool-loop iterations instead of preserving a separate full-session transcript. — **Impact:** post-response accounting depends on a mutable buffer whose meaning changes during execution.

- **[ `lib/server/chat/stream-runner.ts:231-253` ]** — `fullResponse` is reset to `""` after each tool round, and only the final post-tool segment is passed into `runChatPostResponseTasks(...)`. — **Impact:** analytics, token/cost estimation, caching, and mood analysis can undercount or ignore earlier assistant output whenever the response used one or more tool calls.

- **[ `lib/server/chat/stream-preflight.ts:125-142` ]** — `checkAndIncrementVoiceTime(...)` runs for every `chat-stream` request when KV is present, even though there is no `input.voiceMode` guard at the quota boundary. — **Impact:** any non-voice or malformed call to `/api/v1/chat-stream` can consume voice quota and trigger incorrect 429s.

- **[ `app/api/v1/health/route.ts:78-90` ]** — The durable-object health check uses the mutating `/counter/check-increment` path instead of a read-only probe. — **Impact:** health traffic writes counter state on every probe, creating unnecessary mutation load and potential quota-service noise under frequent monitoring.

## 2. Privacy & Security Control Gaps

Status update — 2026-04-27: **Phase 2 completed.** The three Phase 2 findings in this section have now been remediated and validated. Specifically: `hooks/chat/useVoiceStateMachine.ts` now blocks voice memory autosave when `incognitoRef.current` is enabled and sends explicit `incognito` / `analyticsOptOut` flags in the autosave payload for defense in depth; `app/api/v1/live-token/route.ts` now fails closed with `503 SERVICE_UNAVAILABLE` for non-Pro users when KV is unavailable instead of issuing live tokens without a voice-quota check; and focused regressions now protect both the live-token route boundary and the voice autosave privacy seam in `tests/api/live-token/route.test.ts` and `tests/hooks/chat/useVoiceStateMachine.test.ts`. Validation passed with `pnpm exec vitest run tests/api/live-token/route.test.ts tests/hooks/chat/useVoiceStateMachine.test.ts` and `pnpm exec tsc --noEmit --pretty false`.

- **[ `hooks/chat/useVoiceStateMachine.ts:31-35` ]** — The hook contract explicitly documents `incognitoRef` as skipping memory read/write and mood behavior. — **Impact:** callers are led to expect a privacy boundary at the voice client layer.

- **[ `hooks/chat/useVoiceStateMachine.ts:755-767` ]** — The auto-save memory branch posts conversation history to `/api/v1/memory` without checking `incognitoRef.current` and without sending any incognito flag in the payload. — **Impact:** voice conversations can still be persisted to memory while incognito is enabled, which is a direct privacy/control breach.

- **[ `app/api/v1/live-token/route.ts:85-98` ]** — Voice quota is enforced only when KV is available; if KV is missing, the route skips `checkVoiceLimit(...)` and still issues a live token. — **Impact:** live voice access fails open during KV outages, bypassing the stated fail-closed quota model for non-Pro users.

## 3. Rate Limiting & Quota Correctness

Status update — 2026-04-27: **Phase 3 completed.** The three Phase 3 findings in this section have now been remediated and validated. Specifically: `lib/server/security/rate-limiter.ts` now returns a fail-closed unavailable result in production when both the atomic and KV rate-limit backends are unavailable, maps that state to `503 SERVICE_UNAVAILABLE`, and keeps the isolate-local fallback only outside production; `lib/billing/usage-tracker.ts` now exports a shared `VoiceLimitResult`, fails closed for non-Pro users in production when the atomic voice quota service is unavailable for both `checkVoiceLimit()` and `checkAndIncrementVoiceTime()`, and requires a concrete duration for quota mutation paths; and the live callers in `lib/server/chat/route-preflight.ts`, `lib/server/chat/stream-preflight.ts`, `app/api/v1/live-token/route.ts`, `app/api/v1/tts/route.ts`, and `app/api/v1/stt/route.ts` now return `503 SERVICE_UNAVAILABLE` for quota-service unavailability while preserving `429` only for true exhaustion. Focused regressions now cover the generic limiter, voice quota helper, chat preflights, chat route, live-token route, and direct TTS/STT route boundaries in `tests/lib/server/security/rate-limiter.test.ts`, `tests/lib/billing/usage-tracker.test.ts`, `tests/lib/server/chat/route-preflight.test.ts`, `tests/lib/server/chat/stream-preflight.test.ts`, `tests/api/chat/route.test.ts`, `tests/api/live-token/route.test.ts`, `tests/api/tts/route.test.ts`, and `tests/api/stt/route.test.ts`. Validation passed with `pnpm exec vitest run tests/lib/billing/usage-tracker.test.ts tests/lib/server/security/rate-limiter.test.ts tests/lib/server/chat/route-preflight.test.ts tests/lib/server/chat/stream-preflight.test.ts tests/api/live-token/route.test.ts tests/api/chat/route.test.ts tests/api/tts/route.test.ts tests/api/stt/route.test.ts` and `pnpm exec tsc --noEmit --pretty false`. The original findings are retained below as the historical audit record.

- **[ `lib/server/security/rate-limiter.ts:219-250` ]** — The generic user rate limiter still falls back to an isolate-local counter when KV and the atomic path are unavailable. — **Impact:** quotas become per-isolate rather than globally authoritative during infra trouble, so abusive traffic can exceed intended limits across multiple isolates.

- **[ `app/api/v1/live-token/route.ts:80-83` ]** — The live-token route correctly applies the generic AI rate limiter before issuing a relay ticket. — **Impact:** this part is good, but it makes the KV-missing voice-quota bypass more important because the route can still mint voice sessions after only the generic limiter passes.

- **[ `lib/billing/usage-tracker.ts:63-67` ]** — `sanitizeDuration(undefined)` returns the minimum billable 3 seconds. — **Impact:** when combined with unconditional charging in `chat-stream` preflight, missing duration metadata is not neutral; it always consumes quota.

## 4. Storage / Data Integrity Risks

Status update — 2026-04-27: **Phase 4 completed.** The five Phase 4 findings in this section have now been remediated and validated. Specifically: `lib/plugins/data-fetcher.ts` now exposes structured token/context result helpers, logs corrupted OAuth read/migration failures and Google/Notion provider context failures at the source, validates stored token payloads plus provider refresh/search responses, and preserves resilient string-returning wrappers for existing callers. The plugin refresh surface in `lib/server/routes/plugins/runner.ts` now distinguishes broken integrations from missing ones instead of flattening both to `null`, and `components/chat/ChatSidebar.tsx` now surfaces reconnect-needed integration state instead of silently treating it as a normal disconnected state. A final adjacency sweep also hardened `app/api/auth/callback/google/route.ts`, `app/api/auth/callback/notion/route.ts`, and `lib/ai/agents/tools/shared.ts` so OAuth callback state/token payloads are validated and logged, background prefetch failures are logged, and agent-side Google refresh no longer silently swallows provider failures. Focused regressions were added in `tests/lib/plugins/data-fetcher.test.ts`, `tests/api/plugins/route.test.ts`, `tests/api/auth-callback-route.test.ts`, and `tests/lib/ai/agents/tools/shared.test.ts`. Validation passed with `pnpm exec vitest run tests/lib/plugins/data-fetcher.test.ts tests/api/plugins/route.test.ts tests/api/auth-callback-route.test.ts tests/lib/ai/agents/tools/shared.test.ts`, `pnpm exec tsc --noEmit --pretty false`, and `pnpm exec eslint lib/plugins/data-fetcher.ts lib/server/routes/plugins/runner.ts components/chat/ChatSidebar.tsx app/api/auth/callback/google/route.ts app/api/auth/callback/notion/route.ts lib/ai/agents/tools/shared.ts`. The original findings are retained below as the historical audit record.

- **[ `lib/plugins/data-fetcher.ts:30-46` ]** — Google token load/decrypt/parse failures are swallowed into `null` with no logging. — **Impact:** corrupted or undecryptable OAuth state becomes indistinguishable from “user never connected Google,” hiding real storage failures.

- **[ `lib/plugins/data-fetcher.ts:66-82` ]** — Notion token load/decrypt/parse failures are also swallowed into `null` with no logging. — **Impact:** broken integration state silently degrades into missing context instead of surfacing a recoverable operational error.

- **[ `lib/plugins/data-fetcher.ts:95-113` ]** — Google refresh-token failures collapse to `null` with no structured error path. — **Impact:** expired or revoked OAuth refresh flows silently remove calendar functionality from prompts and tools.

- **[ `lib/plugins/data-fetcher.ts:147-187` ]** — Calendar context fetch errors degrade to `""` with no telemetry. — **Impact:** live plugin context can disappear during provider/API failures while the app behaves as if there simply were no events.

- **[ `lib/plugins/data-fetcher.ts:206-247` ]** — Notion context fetch errors also degrade to `""` with no telemetry. — **Impact:** user-facing assistant behavior loses integration context without any observability trail.

## 5. Performance & Scalability Drains

Status update — 2026-04-27: **Phase 5 completed.** The three Phase 5 findings in this section have now been remediated and validated. Specifically: `app/api/v1/health/route.ts` now defaults `/api/v1/health` to a cheaper readiness path by keeping provider, durable-object, and Vectorize probes opt-in behind explicit `probe` / `deep=true` flags, while returning typed cached/skipped status instead of always performing live synthetic work. `lib/ai/providers/router.ts` now separates cheap cached provider snapshots from explicit OpenAI probe checks, so normal health traffic no longer triggers live OpenAI probes, and `lib/server/observability/chat-health.ts` now reports the actual `lastCheckedAt` from recorded outcomes instead of restamping reads. For chat-stream context assembly, `lib/spaces/space-record-store.ts` and `lib/spaces/space-store.ts` now support bounded Space graph reads, and `lib/server/chat/stream-context.ts` now loads bounded newest-first Space snapshots (`limit: 20`) instead of fetching full Space graphs inline. Focused regressions were added/updated in `tests/api/health/root-route.test.ts`, `tests/lib/ai/providers/router.test.ts`, `tests/lib/server/chat/stream-context.test.ts`, and `tests/lib/spaces/space-record-store.test.ts`, and broader adjacent coverage remained green in `tests/api/chat/route.test.ts`, `tests/api/health/v1-route.test.ts`, `tests/api/spaces/route.test.ts`, `tests/lib/spaces/space-store.test.ts`, `tests/lib/spaces/space-store-phase2.test.ts`, `tests/lib/spaces/space-store-phase3.test.ts`, and `tests/lib/spaces/space-store-phase6.test.ts`. Validation passed with `pnpm exec vitest run tests/api/chat/route.test.ts tests/api/health/root-route.test.ts tests/api/health/v1-route.test.ts tests/lib/server/chat/stream-context.test.ts tests/api/spaces/route.test.ts tests/lib/spaces/space-store.test.ts tests/lib/spaces/space-store-phase2.test.ts tests/lib/spaces/space-store-phase3.test.ts tests/lib/spaces/space-store-phase6.test.ts tests/lib/spaces/space-record-store.test.ts tests/lib/ai/providers/router.test.ts`, `./node_modules/.bin/tsc --noEmit --pretty false`, `pnpm exec eslint app/api/v1/health/route.ts lib/ai/providers/router.ts lib/server/observability/chat-health.ts lib/server/chat/stream-context.ts lib/spaces/space-store.ts lib/spaces/space-record-store.ts 'app/api/v1/spaces/[spaceId]/memory/route.ts'`, and `git diff --check -- app/api/v1/health/route.ts lib/ai/providers/router.ts lib/server/observability/chat-health.ts lib/server/chat/stream-context.ts lib/spaces/space-store.ts lib/spaces/space-record-store.ts tests/api/health/root-route.test.ts tests/lib/ai/providers/router.test.ts tests/lib/server/chat/stream-context.test.ts tests/lib/spaces/space-record-store.test.ts`. A broader adjacency sweep also found that `app/api/v1/spaces/[spaceId]/memory/route.ts` still performs a full Space graph read before filtering results; that remains a separate optimization candidate outside the original Phase 5 findings. The original findings are retained below as the historical audit record.

- **[ `app/api/v1/health/route.ts:102-111` ]** — `/api/v1/health` still runs five async infrastructure/provider checks in parallel on every request, including provider-health logic and a durable-object fetch. — **Impact:** the endpoint is lighter than before, but it is still an expensive synthetic-operation path rather than a cheap readiness check.

- **[ `lib/ai/providers/router.ts:113-117` ]** — `checkProviderHealth()` may run a real OpenAI probe whenever cached OpenAI health is stale or unhealthy. — **Impact:** health traffic can still trigger external provider calls, increasing latency/cost and making health behavior dependent on third-party reachability.

- **[ `lib/server/chat/stream-context.ts:145-163` ]** — When spaces exist, chat-stream context building fetches up to three space metas and three full space graphs inline. — **Impact:** memory/context assembly remains a multi-source fan-out path that can materially raise chat-stream latency for users with active spaces.

## 6. Observability & Error Handling Gaps

Status update — 2026-04-27: **Phase 6 completed.** The three Phase 6 findings in this section have now been remediated and validated. Specifically: `hooks/chat/useVoiceStateMachine.ts` now routes voice memory autosave failures through a shared `reportVoiceMemoryAutoSaveFailure()` helper that shows a user-facing toast and sends a structured best-effort POST to the new authenticated `/api/v1/client-errors` logging route; `app/api/v1/client-errors/route.ts` validates the narrow client error payload and emits structured `client.voice_memory_autosave_error` logs with request context; and the already-present plugin token migration warning logs in `lib/plugins/data-fetcher.ts` are now protected by focused regressions so plaintext Google/Notion rewrite failures cannot silently drift back to being swallowed. Focused regressions now cover `tests/hooks/chat/useVoiceStateMachine-autosave-error.test.ts`, `tests/api/client-errors-route.test.ts`, and `tests/lib/plugins/data-fetcher.test.ts`. Validation passed with `pnpm exec vitest run tests/hooks/chat/useVoiceStateMachine.test.ts tests/hooks/chat/useVoiceStateMachine-autosave-error.test.ts tests/api/client-errors-route.test.ts tests/lib/plugins/data-fetcher.test.ts`, `pnpm exec tsc --noEmit --pretty false`, and `pnpm exec eslint hooks/chat/useVoiceStateMachine.ts app/api/v1/client-errors/route.ts lib/plugins/data-fetcher.ts`. The original findings are retained below as the historical audit record.

- **[ `hooks/chat/useVoiceStateMachine.ts:763-767` ]** — Client-side memory auto-save uses `.catch(() => {})` with no user feedback or telemetry. — **Impact:** failed memory writes disappear silently, making privacy bugs and reliability issues harder to detect in production.

- **[ `lib/plugins/data-fetcher.ts:38-42` ]** — Opportunistic migration of legacy plaintext Google tokens catches and ignores rewrite failures. — **Impact:** partial migrations can repeatedly fail without leaving any signal for operators.

- **[ `lib/plugins/data-fetcher.ts:73-78` ]** — Opportunistic migration of legacy plaintext Notion tokens also catches and ignores rewrite failures. — **Impact:** encryption migration can stall silently and remain invisible until a later incident.

## 7. Type Safety & Validation Holes

Status update — 2026-04-27: **Phase 7 completed.** The five Phase 7 findings in this section have now been remediated and validated. Specifically: `app/api/v1/health/route.ts` now uses the typed `emptyProviderHealthStatus()` fallback rather than constructing provider objects through `as any`; `open-next.config.ts` now uses the supported `defineCloudflareConfig()` default export with no cast; and `lib/plugins/data-fetcher.ts` now validates Google refresh responses plus Google Calendar and Notion search payloads at explicit parse boundaries, including deep element validation for third-party arrays before prompt/context shaping. Focused regressions now cover malformed Google refresh, Google Calendar, and Notion payload handling in `tests/lib/plugins/data-fetcher.test.ts`, while adjacent health-route coverage remained green in `tests/api/health/root-route.test.ts`. Validation passed with `pnpm exec vitest run tests/lib/plugins/data-fetcher.test.ts tests/api/health/root-route.test.ts`, `pnpm exec tsc --noEmit --pretty false`, and `pnpm exec eslint lib/plugins/data-fetcher.ts tests/lib/plugins/data-fetcher.test.ts open-next.config.ts app/api/v1/health/route.ts` (ignored-file warnings only for the test file and `open-next.config.ts`).

- **[ `app/api/v1/health/route.ts:107-110` ]** — The provider-health failure fallback constructs `vertex` and `openai` objects with `as any`. — **Impact:** the route’s most failure-sensitive branch bypasses type guarantees, making health-response drift easier to hide.

- **[ `open-next.config.ts:3-5` ]** — The Cloudflare config is exported with `as any`. — **Impact:** config-shape mistakes at the deployment boundary are hidden from TypeScript.

- **[ `lib/plugins/data-fetcher.ts:107-111` ]** — The Google token refresh response is consumed as `any` and trusted for `access_token` / `expires_in`. — **Impact:** malformed upstream responses can flow deeper into auth state without structural validation.

- **[ `lib/plugins/data-fetcher.ts:165-166` ]** — Calendar event payloads are parsed as `any` / `any[]`. — **Impact:** external API shape drift will fail at runtime rather than at a validated boundary.

- **[ `lib/plugins/data-fetcher.ts:224-236` ]** — Notion search results are also parsed as `any` / `any[]`. — **Impact:** prompt-context generation depends on unchecked third-party payload assumptions.

## 8. Test Coverage & Quality Gaps

Status update — 2026-04-28: **Phase 8 completed.** The four Phase 8 findings in this section have now been remediated with direct focused regressions. `tests/middleware.test.ts` now covers protected-media hotlink blocking, same-origin protected-media passthrough, allowed-origin and same-origin-referer protected-media access, malformed-referer blocking, cross-site API mutation blocking, same-origin-referer mutation passthrough, allowed-origin API `OPTIONS` preflight handling, and auth-page IP throttling through the real exported middleware flow. `tests/workers/runtime.test.ts` now covers `syncWorkerStringBindingsToProcessEnv()` and `isLiveRelayRequest()` in `workers/runtime.ts`, and a follow-up adjacency sweep added `tests/workers/entry.test.ts` to protect the actual worker-entry integration path that syncs env bindings and dispatches relay vs OpenNext traffic. For the client privacy boundary, `hooks/chat/useVoiceStateMachine.ts` now routes memory writes through exported direct side-effect helpers, and `tests/hooks/chat/useVoiceStateMachine.test.ts` now protects incognito auto-save skipping, short-conversation skipping, incognito unload-beacon skipping, unload-beacon trimming, and the corresponding allowed-write paths. Stronger validation passed with focused and adjacent worker/live tests, a coverage pass over the Phase 8 files, full `vitest run` (168 files, 1618 tests), and `node ./node_modules/typescript/bin/tsc --noEmit --pretty false`.

- **[ `middleware.ts:111-194` ]** — Protected-media source checks and cross-site mutation blocking are security-critical edge logic, but the current `tests/**/*` scan found no direct middleware coverage for these branches. — **Impact:** regressions in same-origin enforcement can ship unnoticed because the logic only executes inside edge middleware.

- **[ `middleware.ts:505-530` ]** — Auth-page IP throttling has no direct test coverage in the current test scan. — **Impact:** credential-stuffing protections at the page perimeter can drift without a focused regression seam.

- **[ `workers/runtime.ts:5-18` ]** — The worker helper functions for env-binding sync and relay-path detection have no direct tests in the current test scan. — **Impact:** worker-entry regressions can survive until runtime because the helper boundary is effectively unguarded.

- **[ `hooks/chat/useVoiceStateMachine.ts:755-767` ]** — I found no focused test protecting the documented “incognito skips memory writes” expectation at this client boundary. — **Impact:** the current privacy bug could have been caught earlier with a direct hook-level regression.

## 9. Dead Code / Stale Paths / Audit Drift

Status update — 2026-04-28: **Phase 9 completed.** The four Phase 9 findings in this section were re-reviewed against the current tree and are now closed. Specifically: `lib/server/observability/chat-health.ts` was verified with a focused regression in `tests/lib/server/observability/chat-health.test.ts` to preserve a stable exclusion window and clear after cooldown when no new outcomes arrive; `lib/ai/providers/router.ts` already actively probes Vertex via `vertexHealthCheck()` and only probes OpenAI conditionally; and the cited `docs/audits/TECHNICAL_AUDIT_2026-04-23.md` is no longer present in the current repo tree, so those stale-path findings are no longer live file-fix targets. As an adjacent stale-path sweep, current live-relay references were corrected in `lib/ai/live/ticket.ts`, `app/api/v1/live-token/route.ts`, `lib/ai/providers/vertex-client.ts`, and `wrangler.toml` to use `/api/v1/voice-relay` and `workers/live/handler.ts`.

- **[ `lib/server/observability/chat-health.ts:104-123` ]** — `excludedUntil` is recomputed from `Date.now()` each time a summary is read instead of being persisted when a provider first crosses the threshold. — **Impact:** the helper cannot represent a stable cool-down window and would keep extending exclusion while stale failures remain, making the API misleading if exclusion logic is used for routing later.

- **[ `lib/ai/providers/router.ts:106-123` ]** — `checkProviderHealth()` only actively probes OpenAI; `vertex` health is returned from in-memory request history rather than a real probe. — **Impact:** `/api/v1/health` can report Vertex as healthy without actually checking Vertex at all.

- **[ `docs/audits/TECHNICAL_AUDIT_2026-04-23.md:565-568` ]** — The status addendum still references `lib/server/chat-stream-preflight.ts`, `lib/server/chat-stream-context.ts`, and `lib/server/chat-stream-runner.ts`, while the current tree uses `lib/server/chat/stream-preflight.ts`, `lib/server/chat/stream-context.ts`, and `lib/server/chat/stream-runner.ts`. — **Impact:** the repo’s own audit document no longer points to the real files for one of the hottest paths.

- **[ `docs/audits/TECHNICAL_AUDIT_2026-04-23.md:574-579` ]** — The same addendum still cites `lib/server/bindings.ts`, `lib/server/bindings-async.ts`, `workers/live-ws-handler.ts`, and `workers/worker-runtime.ts`, but the current code uses `lib/server/platform/bindings.ts`, `lib/server/platform/bindings-async.ts`, `workers/live/handler.ts`, and `workers/runtime.ts`. — **Impact:** the document is now a partially stale operations map and can mislead future remediation work.

## 10. Documentation / Config Drift

Status update — 2026-04-28: **Phase 10 completed.** The live documentation/config drift in this section has now been remediated and re-verified against the current tree. Specifically: `README.md` now reflects the Gemini/Vertex voice stack, OpenNext Cloudflare deployment model, current `DODO_PLUS_PRODUCT_ID` / `DODO_PRO_PRODUCT_ID` billing configuration, current v2 life-graph key schema, and the real `lib/ai`-based project structure; `SECURITY.md` now documents the current Vertex + Dodo + KV-encryption secret surface, current Cloudflare binding helpers, and accurate budget/rotation guidance; `docs/product/PRD.md` now reflects the live Next.js 15 + Dodo + Gemini stack and current file paths; and `wrangler.toml`, `.env.example`, and `CLAUDE.md` were updated in the same sweep to remove retired ElevenLabs, Razorpay, `@cloudflare/next-on-pages`, legacy `lifegraph:{userId}`, and `DODO_BUSINESS_PRODUCT_ID` references. One original bullet in this section (`wrangler.toml:2-5`) had already been closed by the Section 9 stale-path cleanup because the live file already pointed at `/api/v1/voice-relay` and `workers/live/handler.ts`. Validation for this phase used direct re-reads plus targeted repo greps over the touched docs/config surfaces, which now return no live matches for the stale provider/deployment/path/config strings.

- **[ `README.md:32` ]** — The README still says voice uses “ElevenLabs STT + TTS.” — **Impact:** onboarding and architecture understanding are wrong for the current Gemini-based voice stack.

- **[ `README.md:36` ]** — The README still says deployment is “Cloudflare Pages + @cloudflare/next-on-pages.” — **Impact:** setup guidance is stale; the current repo uses OpenNext Cloudflare tooling and a custom worker entrypoint.

- **[ `README.md:45` ]** — The README voice-flow paragraph still describes an ElevenLabs STT/TTS pipeline. — **Impact:** contributor/operator mental models are now inaccurate on a critical runtime path.

- **[ `README.md:91-93` ]** — The environment table still lists `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` as required voice variables. — **Impact:** new deployments can be misconfigured while missing the actual Gemini/Vertex requirements.

- **[ `SECURITY.md:89-91` ]** — Secret-management instructions still tell operators to provision ElevenLabs secrets. — **Impact:** security/rotation guidance is stale and can send operators rotating the wrong credentials.

- **[ `SECURITY.md:203-205` ]** — Budget-control documentation still claims spend tracking covers “Gemini and ElevenLabs API costs.” — **Impact:** operational cost expectations are inaccurate.

- **[ `docs/product/PRD.md:10-12` ]** — The PRD still names Razorpay for billing and ElevenLabs for voice. — **Impact:** product/spec documentation is materially out of sync with the live Dodo + Gemini stack.

- **[ `wrangler.toml:2-5` ]** — Worker comments still reference `/api/v1/live-ws` and `workers/live-ws-handler.ts`. — **Impact:** runtime-entry documentation inside the deploy config points to old route/file names.

- **[ `wrangler.toml:32-41` ]** — The config comments still enumerate ElevenLabs keys and persona voice IDs. — **Impact:** deployment/config guidance advertises retired secrets and a removed persona model.

## SUMMARY SCORECARD

- **Scope completed**
  - Full read-only audit of repo-owned code, tests, configs, and docs
  - Protected local secret files intentionally excluded per your instruction

- **Findings by category**
  - Runtime Exceptions & Logic Bugs: **4**
  - Privacy & Security Control Gaps: **3**
  - Rate Limiting & Quota Correctness: **3**
  - Storage / Data Integrity Risks: **5**
  - Performance & Scalability Drains: **3**
  - Observability & Error Handling Gaps: **3**
  - Type Safety & Validation Holes: **5**
  - Test Coverage & Quality Gaps: **4**
  - Dead Code / Stale Paths / Audit Drift: **4**
  - Documentation / Config Drift: **9**

- **Total findings**
  - **43**

- **Single most urgent fix**
  - **[ `hooks/chat/useVoiceStateMachine.ts:755-767` ] — incognito voice conversations can still be written to `/api/v1/memory` — impact: this violates the user-facing privacy contract and can persist conversations the user explicitly expected not to save.**

## Status

- **Completed**
  - Read-only audit executed
  - Line-specific findings gathered
  - Protected local secret files excluded as requested
  - Section 9 remediation applied and validated on 2026-04-28
  - Section 10 remediation applied and validated on 2026-04-28

- **Not done**
  - Remaining audit sections outside Sections 9-10 still require remediation

If you want, I can now turn this directly into a **prioritized remediation execution plan** or start fixing the **top 3 findings** in code.
