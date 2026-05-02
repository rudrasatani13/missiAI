import type { BenchmarkResult, BenchmarkType } from "./benchmark-utils"
import {
  buildMemoryStats,
  computeStats,
  dedupeNotes,
  emptyMemorySnapshot,
  formatError,
  getProcessMemorySnapshot,
  mergePeakMemory,
  nowIso,
  roundMetric,
} from "./benchmark-utils"
import type { FeatureManifestEntry, HttpBenchmarkSpec } from "./feature-manifest"

export interface HttpBenchmarkContext {
  baseUrl: string | null
  requestHeaders: Record<string, string>
  allowAuthenticated: boolean
  allowExternalCalls: boolean
  dryRun: boolean
  iterations: number
  warmupIterations: number
  timeoutMs: number
  managedServerPid?: number
}

export async function runHttpBenchmark(args: {
  feature: FeatureManifestEntry
  spec: HttpBenchmarkSpec
  context: HttpBenchmarkContext
  benchmarkType: Extract<BenchmarkType, "http-route-latency" | "api-latency">
  targetKind: BenchmarkResult["targetKind"]
}): Promise<BenchmarkResult> {
  const { feature, spec, context, benchmarkType, targetKind } = args
  const startedAt = nowIso()
  const targetUrl = buildTargetUrl(context.baseUrl, spec.target, spec.query)
  const notes: string[] = []

  if (context.dryRun) {
    return skippedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
      "Dry-run mode enabled; no network call was executed.",
    ])
  }

  if (!context.baseUrl) {
    return skippedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
      "No base URL supplied. Use --base-url or --server-command when running HTTP/API benchmarks.",
    ])
  }

  if (spec.authMode === "required" && !context.allowAuthenticated) {
    return skippedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
      "Auth-required target skipped because no benchmark auth headers or cookies were supplied.",
    ])
  }

  const missingEnv = (spec.requiresEnv ?? []).filter((envName) => !process.env[envName])
  if (missingEnv.length > 0) {
    return skippedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
      `Missing env: ${missingEnv.join(", ")}`,
    ])
  }

  if (spec.requiresMocking && !context.allowExternalCalls) {
    return skippedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
      "Target marked as provider-backed. Re-run with fixture support or --allow-external-calls.",
    ])
  }

  const expectedStatuses = new Set<number>(
    Array.isArray(spec.expectedStatus) ? spec.expectedStatus : [spec.expectedStatus ?? 200],
  )

  try {
    const requestInit: RequestInit = {
      method: spec.method ?? "GET",
      headers: {
        ...context.requestHeaders,
        ...spec.headers,
      },
      body: spec.body,
    }

    const initialMemory = context.managedServerPid
      ? await getProcessMemorySnapshot(context.managedServerPid)
      : await emptyMemorySnapshot()
    let peakMemory = initialMemory

    for (let warmupIndex = 0; warmupIndex < context.warmupIterations; warmupIndex += 1) {
      const warmupResponse = await fetchWithTimeout(targetUrl, requestInit, context.timeoutMs)
      await warmupResponse.arrayBuffer()
      if (context.managedServerPid) {
        peakMemory = mergePeakMemory(peakMemory, await getProcessMemorySnapshot(context.managedServerPid))
      }
    }

    const samplesMs: number[] = []
    let lastStatus = 0

    for (let iteration = 0; iteration < context.iterations; iteration += 1) {
      const started = performance.now()
      const response = await fetchWithTimeout(targetUrl, requestInit, context.timeoutMs)
      await response.arrayBuffer()
      const elapsed = performance.now() - started
      samplesMs.push(roundMetric(elapsed))
      lastStatus = response.status

      if (!expectedStatuses.has(response.status)) {
        return failedResult(feature, spec, benchmarkType, targetKind, targetUrl, [
          `Unexpected HTTP status ${response.status}; expected ${[...expectedStatuses].join(", ")}.`,
        ])
      }

      if (context.managedServerPid) {
        peakMemory = mergePeakMemory(peakMemory, await getProcessMemorySnapshot(context.managedServerPid))
      }
    }

    const finalMemory = context.managedServerPid
      ? await getProcessMemorySnapshot(context.managedServerPid)
      : initialMemory

    if (spec.notes) notes.push(spec.notes)

    return {
      id: `${feature.id}:${spec.id}`,
      featureId: feature.id,
      featureName: feature.name,
      category: feature.category,
      benchmarkType,
      targetKind,
      target: targetUrl,
      status: "completed",
      risk: feature.benchmarkPriority,
      authRequired: spec.authMode === "required" || feature.authRequired,
      externalServices: feature.externalServices,
      startedAt,
      finishedAt: nowIso(),
      stats: computeStats(samplesMs),
      memory: buildMemoryStats(initialMemory, finalMemory, peakMemory),
      bundleImpact: null,
      notes: dedupeNotes(notes),
      metadata: {
        iterations: context.iterations,
        warmupIterations: context.warmupIterations,
        lastStatus,
        method: requestInit.method ?? "GET",
        expectedStatuses: [...expectedStatuses],
      },
    }
  } catch (error) {
    return failedResult(feature, spec, benchmarkType, targetKind, targetUrl, [formatError(error)])
  }
}

function buildTargetUrl(
  baseUrl: string | null,
  target: string,
  query?: Record<string, string>,
): string {
  if (!baseUrl) return target
  const url = new URL(target, baseUrl)
  Object.entries(query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url.toString()
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function skippedResult(
  feature: FeatureManifestEntry,
  spec: HttpBenchmarkSpec,
  benchmarkType: Extract<BenchmarkType, "http-route-latency" | "api-latency">,
  targetKind: BenchmarkResult["targetKind"],
  targetUrl: string,
  notes: string[],
): BenchmarkResult {
  return {
    id: `${feature.id}:${spec.id}`,
    featureId: feature.id,
    featureName: feature.name,
    category: feature.category,
    benchmarkType,
    targetKind,
    target: targetUrl,
    status: "skipped",
    risk: feature.benchmarkPriority,
    authRequired: spec.authMode === "required" || feature.authRequired,
    externalServices: feature.externalServices,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    stats: null,
    memory: null,
    bundleImpact: null,
    notes: dedupeNotes([spec.notes, ...notes]),
    metadata: {
      method: spec.method ?? "GET",
    },
  }
}

function failedResult(
  feature: FeatureManifestEntry,
  spec: HttpBenchmarkSpec,
  benchmarkType: Extract<BenchmarkType, "http-route-latency" | "api-latency">,
  targetKind: BenchmarkResult["targetKind"],
  targetUrl: string,
  notes: string[],
): BenchmarkResult {
  return {
    id: `${feature.id}:${spec.id}`,
    featureId: feature.id,
    featureName: feature.name,
    category: feature.category,
    benchmarkType,
    targetKind,
    target: targetUrl,
    status: "failed",
    risk: feature.benchmarkPriority,
    authRequired: spec.authMode === "required" || feature.authRequired,
    externalServices: feature.externalServices,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    stats: null,
    memory: null,
    bundleImpact: null,
    notes: dedupeNotes([spec.notes, ...notes]),
    metadata: {
      method: spec.method ?? "GET",
    },
  }
}
