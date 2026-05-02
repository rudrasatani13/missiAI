# Benchmark Methodology

## Scope

This framework is feature-oriented. It inventories the real route, API, server, client, worker, and integration surface of the repo and measures the system later by feature group instead of by isolated files.

## Benchmark types

- HTTP route latency: page responses such as `/chat`, `/memory`, `/pricing`, `/admin`
- API latency: endpoints under `app/api/` and `app/api/v1/`
- Server-function benchmark: direct timing of server modules that can be invoked in-process
- Build time: workspace build commands, including `build` and `build:cf` when present
- Bundle size: route and API chunk sizes derived from `.next/app-build-manifest.json`
- Render/import cost: repeated module import timing for selected app, component, and hook targets
- Memory usage: RSS and heap deltas where the runtime permits measurement
- Mocked integration benchmark: provider-backed code paths measured only with fixtures unless live traffic is explicitly enabled

## Execution model

- `benchmarks/feature-manifest.ts` is the source of truth for discovered features and planned benchmark targets.
- `benchmarks/run-feature-benchmarks.ts` runs route/API/server benchmarks and can optionally include build/bundle work with `--baseline` or `--with-build`.
- `benchmarks/bundle-benchmark.ts` runs build-time, bundle-size, and import-cost passes.
- `benchmarks/report-writer.ts` converts JSON result files into Markdown reports.

## Safety rules

- No production secrets are required by default.
- Auth-protected routes and APIs are marked in the manifest and skipped unless benchmark auth is explicitly supplied.
- External AI, billing, calendar, Notion, bot, and storage integrations should use fixtures by default.
- If a fixture or env var is missing, the result must be `skipped`, never a fabricated success.
- Benchmark scripts must not change production code paths or weaken test/lint/typecheck requirements.

## Build and bundle analysis

- Build-time rows are measured from real command execution.
- Route and API bundle rows are derived from `.next/app-build-manifest.json`.
- Total build artifact size is captured from `.next/`.
- OpenNext/Cloudflare artifact size is captured from `.open-next/`.
- Import-cost rows attempt to load selected modules directly in the benchmark runtime. Browser-only modules that cannot be loaded safely are marked `skipped`.

## Statistics

For latency-capable benchmarks, the framework records:

- p50
- p75
- p95
- average
- min
- max
- standard deviation

Warmup samples are excluded from the reported statistics.

## Output

- JSON results: `benchmarks/results/*.json`
- Baseline report: `docs/benchmarks/BASELINE_REPORT.md`
- Compare report: `docs/benchmarks/COMPARE_REPORT.md`
- Ad hoc run report: `docs/benchmarks/LATEST_RUN_REPORT.md`

## Suggested later baseline flow

1. Start a local benchmark server or pass `--server-command`.
2. Supply auth only when benchmarking auth-required routes.
3. Run `pnpm bench:baseline`.
4. Confirm skipped rows are genuinely unactionable and not fixture gaps.
5. Implement performance changes separately from the benchmark framework.
6. Re-run the same selection and generate `pnpm bench:compare`.

## Risk labels

- P0 = critical performance issue
- P1 = high-impact optimization
- P2 = medium improvement
- P3 = nice-to-have
