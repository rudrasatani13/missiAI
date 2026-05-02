# Compare Report

Generated: 2026-05-02T17:25:00+05:30
Baseline JSON: `benchmarks/results/baseline-20260501-222503.json`
After build JSON: `benchmarks/results/after-build-20260502-171451.json`
After feature JSON: `benchmarks/results/after-features-20260502-171451.json`
After baseline JSON: `benchmarks/results/after-baseline-20260502-171451.json`

## Source Notes

- Bundle-size, build-time, and direct import comparisons below use `after-build-20260502-171451.json` because it isolates the post-fix build graph without full-suite contention.
- Runtime coverage summary and skip counts come from `after-baseline-20260502-171451.json`.
- The previous regressed state referenced by this report is the earlier optimization pass captured in `docs/benchmarks/COMPARE_REPORT.md` history and `benchmarks/results/after-build-20260501-232103.json` / `after-features-with-build-20260501-232103.json`.

## Comparison

| Feature | Metric | Before | After | Delta | Percent Change | Improved? | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Exam Buddy | Bundle size | 1,382,772 B | 1,038,717 B | -344,055 B | -24.88% | Yes | Kept the quiz-flow split, but removed the page-level dashboard split and the redundant nested quiz-view split that were hurting build throughput. |
| Chat Core and SSE Streaming | Bundle size | 1,159,465 B | 1,106,647 B | -52,818 B | -4.56% | Yes | Preserved the live-setup deferral and one consolidated optional-overlay split instead of five separate chat boundaries. |
| Voice, STT, TTS, and Live Relay | Bundle size | 1,159,976 B | 1,107,158 B | -52,818 B | -4.55% | Yes | Voice still benefits from the deferred `resolveLiveSetup()` path; route savings are smaller than the earlier peak but build throughput recovered. |
| Agents, Actions, and Tool Execution | Bundle size | 1,187,714 B | 1,110,441 B | -77,273 B | -6.51% | Yes | The route keeps a thin lazy shell for agent UI while avoiding the earlier page-level `next/dynamic` wrapper. |
| Workspace Build Pipeline | `pnpm run build` p95 | 51.608 s | 39.285 s | -12.323 s | -23.88% | Yes | Normal build throughput is now better than the original baseline and much better than the regressed 88.086 s state. |
| Workspace Build Pipeline | `pnpm run build:cf` p95 | 41.141 s | 44.984 s | +3.843 s | +9.34% | No | Cloudflare/OpenNext build is dramatically better than the regressed 130.010 s state, but still slightly above the original baseline. |
| Agents, Actions, and Tool Execution | Import p95 for `components/agents/AgentDashboard.tsx` | 0.758 ms | 0.710 ms | -0.048 ms | -6.33% | Yes | Turning `AgentDashboard.tsx` into a thin shell fixed the earlier direct-import regression. |
| Chat Core and SSE Streaming | Import p95 for `app/chat/page.tsx` | 3.088 ms | 0.910 ms | -2.178 ms | -70.53% | Yes | The route no longer eagerly imports live prompt/tool setup, and the remaining optional UI is grouped behind one lazy boundary. |
| Voice, STT, TTS, and Live Relay | Import p95 for `hooks/chat/useGeminiLive.ts` | 1.568 ms | 0.995 ms | -0.573 ms | -36.54% | Yes | Live voice setup is still resolved on connect instead of page import. |
| Voice, STT, TTS, and Live Relay | Import p95 for `hooks/chat/useVoiceStateMachine.ts` | 2.312 ms | 1.224 ms | -1.088 ms | -47.06% | Yes | The hot voice state machine path is back below the original baseline. |

## What Caused The Build Regression

- The previous pass added too many `next/dynamic` boundaries at once: full-page wrappers in `/chat`, `/exam-buddy`, and `/agents`, plus four separate chat overlay splits and a redundant nested `QuizView` split under an already-lazy `QuizCreator`.
- That reduced route entry bundles, but it also expanded the async client graph and forced Next/OpenNext to produce more client-reference bookkeeping and extra async chunk wiring during `build` and especially `build:cf`.
- The worst cost came from low-value boundaries: page-level `ssr: false` wrappers and optional UI panels that were split independently instead of as one meaningful group.

## Dynamic Imports Kept

- `app/chat/page.tsx`: deferred runtime `import()` inside `resolveLiveSetup()` for `buildVoiceSystemPrompt` and `AGENT_FUNCTION_DECLARATIONS`.
- `components/chat/ChatPageShell.tsx`: one consolidated lazy boundary for `ChatOptionalOverlays`.
- `components/exam-buddy/ExamBuddyHub.tsx`: one lazy boundary for `QuizCreator`.
- `components/agents/AgentDashboard.tsx`: one thin lazy shell for `AgentDashboardContent`.
- `components/chat/ChatPageShell.tsx`: existing `ParticleVisualizer` `next/dynamic` boundary remains because it keeps `three` out of the server and edge bundle.

## Dynamic Imports Removed Or Consolidated

- Removed page-level lazy wrapper for `ChatPageShell` in `app/chat/page.tsx`.
- Removed four independent chat overlay lazy boundaries for `ActionCard`, `AgentSteps`, `OnboardingTour`, and `DailyBriefBanner`; replaced them with one `ChatOptionalOverlays` split.
- Removed page-level lazy wrapper for `ExamBuddyHub` in `app/exam-buddy/page.tsx`.
- Removed `WeakTopicsCard` lazy split.
- Removed the nested `QuizView` lazy split inside `QuizCreator`.
- Removed the page-level lazy wrapper for `AgentDashboard` in `app/agents/page.tsx`.
- Replaced the three remaining route-adjacent `next/dynamic` wrappers with `React.lazy`/`Suspense` to keep the same split points with less Next/OpenNext-specific metadata overhead.

## Top Improvements

- `pnpm run build` dropped from the regressed `88.086 s` to `39.285 s` in the isolated build benchmark, and is now `23.88%` better than the original `51.608 s` baseline.
- `pnpm run build:cf` dropped from the regressed `130.010 s` to `44.984 s` (`-65.40%` vs the bad state).
- `AgentDashboard.tsx` import p95 dropped from the regressed `2.172 ms` to `0.710 ms` (`-67.31%` vs the bad state, `-6.33%` vs the original baseline).
- `app/chat/page.tsx` import p95 fell from `3.088 ms` to `0.910 ms`.
- The route bundles still retain real savings: Exam Buddy `-24.88%`, Agents `-6.51%`, Chat `-4.56%`, Voice `-4.55%` versus the original baseline.

## Regressions

- `pnpm run build:cf` is still `9.34%` above the original baseline (`44.984 s` vs `41.141 s`).
- The final route-bundle wins are smaller than the earlier peak optimization pass:
  - Exam Buddy is `1,038,717 B` now vs the earlier peak `898,135 B`.
  - Chat is `1,106,647 B` now vs the earlier peak `1,038,656 B`.
  - Voice is `1,107,158 B` now vs the earlier peak `1,039,167 B`.
  - Agents is `1,110,441 B` now vs the earlier peak `1,100,200 B`.

## Files Changed

- `app/chat/page.tsx`
- `components/chat/ChatPageShell.tsx`
- `components/chat/ChatOptionalOverlays.tsx`
- `hooks/chat/useGeminiLive.ts`
- `app/exam-buddy/page.tsx`
- `components/exam-buddy/ExamBuddyHub.tsx`
- `components/exam-buddy/QuizCreator.tsx`
- `app/agents/page.tsx`
- `components/agents/AgentDashboard.tsx`
- `components/agents/AgentDashboardContent.tsx`

## Exact Change Reasons

- `app/chat/page.tsx`: removed the page-level lazy shell because it was a high-overhead split; kept the live voice setup behind runtime `import()` because that import deferral gave a strong hot-path win with no behavior change.
- `components/chat/ChatPageShell.tsx` and `components/chat/ChatOptionalOverlays.tsx`: consolidated four low-value optional chat splits into one grouped overlay boundary so the route keeps some bundle relief without multiplying chunk metadata.
- `app/exam-buddy/page.tsx`, `components/exam-buddy/ExamBuddyHub.tsx`, and `components/exam-buddy/QuizCreator.tsx`: kept only the meaningful quiz-flow split and removed the dashboard-level and nested quiz-view boundaries that were adding build cost for little extra route benefit.
- `app/agents/page.tsx`, `components/agents/AgentDashboard.tsx`, and `components/agents/AgentDashboardContent.tsx`: restored a stable route import and moved the agent UI behind a thin lazy shell so direct import cost recovered without pushing the heavy dashboard back into the page entry module.

## Validation Status

- `pnpm typecheck`: passed
- `pnpm lint`: passed with the same pre-existing warning in `lib/memory/life-graph.ts:37`
- `pnpm test`: the suite hit the same pre-existing flaky analytics assertion once at `tests/lib/analytics/aggregator.test.ts:234`, then passed on rerun with no code changes
- `pnpm build`: passed
- `pnpm run build:cf`: passed
- `pnpm bench:build`: passed
- `pnpm bench -- --feature chat-core,voice-live,exam-buddy,agents-actions --server-command "pnpm start" --port 3000 --timeout-ms 60000 --with-build`: passed
- `pnpm bench:baseline -- --server-command "pnpm start" --port 3000 --timeout-ms 60000`: passed

## Remaining Bottlenecks

- `build:cf` is still slightly slower than the original baseline, which means OpenNext bundle generation remains the last throughput hotspot.
- Chat and voice route bundles are still improved, but only modestly; the remaining work should focus on large optional UI or heavy imported dependencies that can be isolated without reintroducing many split points.
- Exam Buddy still carries a large dashboard bundle even after keeping the quiz flow separate.

## Recommended Next PRs

- Investigate OpenNext-specific bundle generation around `.open-next/server-functions/default/.next/server/chunks/*` and the generated worker packaging path in `workers/entry.ts` to close the remaining `build:cf` gap.
- Audit the heaviest chat/dashboard dependencies inside `ChatOptionalOverlays` and `ExamBuddyHub` for one more high-value extraction, but keep the boundary count low.
- Add a benchmark note or retry guard for the flaky analytics snapshot test so validation reporting stops mixing true product regressions with the known timestamp race.
