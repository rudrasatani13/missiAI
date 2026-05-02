# Benchmark Framework

This directory contains the Phase 1 benchmark framework only. It is designed to inventory features, run later feature-wise benchmarks safely, and write JSON plus Markdown reports without changing production behavior.

## Files

- `feature-manifest.ts`: Canonical inventory of discovered features, routes, APIs, key files, services, and benchmark plans.
- `run-feature-benchmarks.ts`: Main feature runner for HTTP routes, APIs, server functions, and optional build/bundle passes.
- `http-benchmark.ts`: Page and route latency benchmark adapter.
- `api-benchmark.ts`: API latency adapter with auth/mocking skip behavior.
- `server-function-benchmark.ts`: In-process benchmark adapter for server functions and mocked integrations.
- `bundle-benchmark.ts`: Build-time, bundle-size, and import-cost benchmark runner.
- `report-writer.ts`: Markdown report generator for baseline and compare reports.
- `benchmark-utils.ts`: Shared CLI parsing, statistics, file IO, and memory helpers.
- `fixtures/`: Location for future benchmark payloads and provider mocks.
- `results/`: JSON benchmark output.

## Safety model

- Missing auth, missing env, and missing mock fixtures produce `skipped` results instead of crashing the suite.
- Provider-backed benchmarks should stay fixture-backed by default. Only use `--allow-external-calls` when you intentionally want live traffic.
- Auth-required pages and APIs are marked in the manifest. They are skipped unless you explicitly provide a cookie or auth header.
- No baseline numbers are hardcoded. Reports are generated only from real run output.

## Commands

- `pnpm bench -- --help`
- `pnpm bench:features`
- `pnpm bench:feature <feature-id>`
- `pnpm bench:baseline`
- `pnpm bench:build`
- `pnpm bench:compare`

## Typical later flow

1. Start or let the runner start a local app server.
2. Run `pnpm bench:baseline` to capture the initial state and write `benchmarks/results/*.json` plus `docs/benchmarks/BASELINE_REPORT.md`.
3. Make targeted performance changes outside this framework phase.
4. Re-run the same benchmark selection.
5. Run `pnpm bench:compare` to write `docs/benchmarks/COMPARE_REPORT.md`.

## Example later invocations

```bash
pnpm bench:features -- --server-command "pnpm start" --port 3000 --allow-authenticated --cookie "YOUR_SESSION_COOKIE"
pnpm bench:feature chat-core -- --base-url http://127.0.0.1:3000 --allow-authenticated --cookie "YOUR_SESSION_COOKIE"
pnpm bench:baseline -- --server-command "pnpm start" --port 3000 --allow-authenticated --cookie "YOUR_SESSION_COOKIE"
pnpm bench:build
pnpm bench:compare
```
