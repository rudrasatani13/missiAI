import { pathToFileURL } from "node:url"
import type { BenchmarkResult, BenchmarkType } from "./benchmark-utils"
import {
  buildMemoryStats,
  computeStats,
  dedupeNotes,
  formatError,
  getRuntimeMemorySnapshot,
  mergePeakMemory,
  nowIso,
  pathExists,
  resolveProjectPath,
  roundMetric,
} from "./benchmark-utils"
import type { FeatureManifestEntry, ServerFunctionBenchmarkSpec } from "./feature-manifest"

export interface ServerBenchmarkFixture {
  beforeAll?: () => Promise<void> | void
  afterAll?: () => Promise<void> | void
  beforeEach?: () => Promise<void> | void
  afterEach?: () => Promise<void> | void
  createArgs?: () => Promise<unknown[]> | unknown[]
  getArgs?: () => Promise<unknown[]> | unknown[]
  validateResult?: (result: unknown) => Promise<void> | void
}

export interface ServerFunctionBenchmarkContext {
  iterations: number
  warmupIterations: number
  dryRun: boolean
  allowExternalCalls: boolean
}

export async function runServerFunctionBenchmark(args: {
  feature: FeatureManifestEntry
  spec: ServerFunctionBenchmarkSpec
  context: ServerFunctionBenchmarkContext
}): Promise<BenchmarkResult> {
  const { feature, spec, context } = args
  const benchmarkType = spec.benchmarkType ?? ("server-function-benchmark" satisfies BenchmarkType)
  const startedAt = nowIso()

  if (context.dryRun) {
    return skippedResult(feature, spec, benchmarkType, ["Dry-run mode enabled; no server function was executed."])
  }

  const missingEnv = (spec.requiresEnv ?? []).filter((envName) => !process.env[envName])
  if (missingEnv.length > 0) {
    return skippedResult(feature, spec, benchmarkType, [`Missing env: ${missingEnv.join(", ")}`])
  }

  if (spec.requiresMocking && !context.allowExternalCalls && !spec.fixtureModule) {
    return skippedResult(feature, spec, benchmarkType, [
      "Function marked as provider-backed and no fixture module is configured yet.",
    ])
  }

  const absoluteModulePath = resolveProjectPath(spec.modulePath)
  if (!(await pathExists(absoluteModulePath))) {
    return failedResult(feature, spec, benchmarkType, [
      `Configured module does not exist: ${spec.modulePath}`,
    ])
  }

  let fixture: ServerBenchmarkFixture | undefined
  if (spec.fixtureModule) {
    const fixtureModulePath = resolveProjectPath(spec.fixtureModule)
    if (!(await pathExists(fixtureModulePath))) {
      return skippedResult(feature, spec, benchmarkType, [
        `Fixture module not found yet: ${spec.fixtureModule}`,
      ])
    }

    const fixtureImport = (await import(
      `${pathToFileURL(fixtureModulePath).href}?bench=${Date.now()}`
    )) as Record<string, unknown>
    const exportedFixture =
      fixtureImport[spec.fixtureExport ?? "fixture"] ??
      fixtureImport.default

    if (exportedFixture && typeof exportedFixture === "object") {
      fixture = exportedFixture as ServerBenchmarkFixture
    }
  }

  if (spec.requiresMocking && !context.allowExternalCalls && !fixture) {
    return skippedResult(feature, spec, benchmarkType, [
      "Fixture is required for this benchmark and no live provider calls are allowed.",
    ])
  }

  const importedModule = (await import(
    `${pathToFileURL(absoluteModulePath).href}?bench=${Date.now()}`
  )) as Record<string, unknown>
  const candidate = importedModule[spec.exportName]

  if (typeof candidate !== "function") {
    return failedResult(feature, spec, benchmarkType, [
      `Export ${spec.exportName} was not found or is not callable in ${spec.modulePath}.`,
    ])
  }

  const benchmarkFunction = candidate as (...args: unknown[]) => unknown | Promise<unknown>

  const buildArgs = async (): Promise<unknown[]> => {
    if (fixture?.createArgs) return await fixture.createArgs()
    if (fixture?.getArgs) return await fixture.getArgs()
    if (Array.isArray(spec.staticArgs)) return spec.staticArgs
    return []
  }

  const sampleArgs = await buildArgs()
  if (sampleArgs.length === 0 && !fixture && !Array.isArray(spec.staticArgs)) {
    return skippedResult(feature, spec, benchmarkType, [
      "No static args or fixture configured for this server-function benchmark yet.",
    ])
  }

  try {
    await fixture?.beforeAll?.()
    const initialMemory = await getRuntimeMemorySnapshot()
    let peakMemory = initialMemory

    for (
      let warmupIndex = 0;
      warmupIndex < (spec.warmupIterations ?? context.warmupIterations);
      warmupIndex += 1
    ) {
      const warmupArgs = warmupIndex === 0 ? sampleArgs : await buildArgs()
      await fixture?.beforeEach?.()
      try {
        const warmupResult = await benchmarkFunction(...warmupArgs)
        await fixture?.validateResult?.(warmupResult)
      } finally {
        await fixture?.afterEach?.()
      }
      peakMemory = mergePeakMemory(peakMemory, await getRuntimeMemorySnapshot())
    }

    const samplesMs: number[] = []

    for (
      let iteration = 0;
      iteration < (spec.iterations ?? context.iterations);
      iteration += 1
    ) {
      const invocationArgs = iteration === 0 ? sampleArgs : await buildArgs()
      await fixture?.beforeEach?.()
      const started = performance.now()
      try {
        const result = await benchmarkFunction(...invocationArgs)
        await fixture?.validateResult?.(result)
      } finally {
        await fixture?.afterEach?.()
      }
      const elapsed = performance.now() - started
      samplesMs.push(roundMetric(elapsed))
      peakMemory = mergePeakMemory(peakMemory, await getRuntimeMemorySnapshot())
    }

    const finalMemory = await getRuntimeMemorySnapshot()
    await fixture?.afterAll?.()

    return {
      id: `${feature.id}:${spec.id}`,
      featureId: feature.id,
      featureName: feature.name,
      category: feature.category,
      benchmarkType,
      targetKind: spec.requiresMocking ? "integration" : "function",
      target: `${spec.modulePath}#${spec.exportName}`,
      status: "completed",
      risk: feature.benchmarkPriority,
      authRequired: feature.authRequired,
      externalServices: feature.externalServices,
      startedAt,
      finishedAt: nowIso(),
      stats: computeStats(samplesMs),
      memory: buildMemoryStats(initialMemory, finalMemory, peakMemory),
      bundleImpact: null,
      notes: dedupeNotes([spec.notes]),
      metadata: {
        iterations: spec.iterations ?? context.iterations,
        warmupIterations: spec.warmupIterations ?? context.warmupIterations,
        fixtureModule: spec.fixtureModule ?? null,
      },
    }
  } catch (error) {
    try {
      await fixture?.afterAll?.()
    } catch {
      // Preserve the original benchmark failure.
    }
    return failedResult(feature, spec, benchmarkType, [formatError(error)])
  }
}

function skippedResult(
  feature: FeatureManifestEntry,
  spec: ServerFunctionBenchmarkSpec,
  benchmarkType: BenchmarkType,
  notes: string[],
): BenchmarkResult {
  return {
    id: `${feature.id}:${spec.id}`,
    featureId: feature.id,
    featureName: feature.name,
    category: feature.category,
    benchmarkType,
    targetKind: spec.requiresMocking ? "integration" : "function",
    target: `${spec.modulePath}#${spec.exportName}`,
    status: "skipped",
    risk: feature.benchmarkPriority,
    authRequired: feature.authRequired,
    externalServices: feature.externalServices,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    stats: null,
    memory: null,
    bundleImpact: null,
    notes: dedupeNotes([spec.notes, ...notes]),
    metadata: {
      fixtureModule: spec.fixtureModule ?? null,
    },
  }
}

function failedResult(
  feature: FeatureManifestEntry,
  spec: ServerFunctionBenchmarkSpec,
  benchmarkType: BenchmarkType,
  notes: string[],
): BenchmarkResult {
  return {
    id: `${feature.id}:${spec.id}`,
    featureId: feature.id,
    featureName: feature.name,
    category: feature.category,
    benchmarkType,
    targetKind: spec.requiresMocking ? "integration" : "function",
    target: `${spec.modulePath}#${spec.exportName}`,
    status: "failed",
    risk: feature.benchmarkPriority,
    authRequired: feature.authRequired,
    externalServices: feature.externalServices,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    stats: null,
    memory: null,
    bundleImpact: null,
    notes: dedupeNotes([spec.notes, ...notes]),
    metadata: {
      fixtureModule: spec.fixtureModule ?? null,
    },
  }
}
