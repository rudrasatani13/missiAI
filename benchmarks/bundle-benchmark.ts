import path from "node:path"
import { pathToFileURL } from "node:url"
import type { BenchmarkResult, BenchmarkRunOutput } from "./benchmark-utils"
import {
  BENCHMARK_RESULTS_DIR,
  buildMemoryStats,
  collectFilesRecursive,
  computeStats,
  createRunId,
  dedupeNotes,
  formatError,
  getRuntimeMemorySnapshot,
  mergePeakMemory,
  nowIso,
  parseCliArgs,
  pathExists,
  readJsonFile,
  renderUsage,
  resolveProjectPath,
  roundMetric,
  runCommand,
  sumFileSizes,
  writeJsonFile,
} from "./benchmark-utils"
import { featureManifest, featureManifestById, type BundleBenchmarkSpec, type FeatureManifestEntry } from "./feature-manifest"

interface AppBuildManifest {
  pages?: Record<string, string[]>
}

export interface BundleBenchmarkContext {
  executeBuild: boolean
  dryRun: boolean
  iterations: number
  warmupIterations: number
}

export async function runBundleBenchmarks(
  features: FeatureManifestEntry[],
  context: BundleBenchmarkContext,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  if (context.executeBuild) {
    results.push(...(await runWorkspaceBuildBenchmarks(context)))
  }

  results.push(...(await runFeatureBundleSizeBenchmarks(features)))
  results.push(...(await runImportCostBenchmarks(features, context)))

  return results
}

async function runWorkspaceBuildBenchmarks(
  context: BundleBenchmarkContext,
): Promise<BenchmarkResult[]> {
  const pkg = await readJsonFile<{ scripts?: Record<string, string> }>(resolveProjectPath("package.json"))
  const candidateScripts = ["build", "build:cf"].filter((name) => Boolean(pkg.scripts?.[name]))
  const results: BenchmarkResult[] = []

  for (const scriptName of candidateScripts) {
    const startedAt = nowIso()

    if (context.dryRun) {
      results.push({
        id: `workspace-build:${scriptName}`,
        featureId: "workspace-build",
        featureName: "Workspace Build Pipeline",
        category: "infrastructure",
        benchmarkType: "build-time",
        targetKind: "build",
        target: `pnpm run ${scriptName}`,
        status: "skipped",
        risk: "P0",
        authRequired: false,
        externalServices: ["Next.js", "OpenNext Cloudflare"],
        startedAt,
        finishedAt: nowIso(),
        stats: null,
        memory: null,
        bundleImpact: null,
        notes: ["Dry-run mode enabled; no build command was executed."],
        metadata: {
          scriptName,
        },
      })
      continue
    }

    const commandResult = await runCommand(`pnpm run ${scriptName}`, {
      cwd: resolveProjectPath(),
    })

    const buildArtifactBytes = await measureDirectoryBytes(resolveProjectPath(".next"))
    const openNextArtifactBytes = await measureDirectoryBytes(resolveProjectPath(".open-next"))

    results.push({
      id: `workspace-build:${scriptName}`,
      featureId: "workspace-build",
      featureName: "Workspace Build Pipeline",
      category: "infrastructure",
      benchmarkType: "build-time",
      targetKind: "build",
      target: `pnpm run ${scriptName}`,
      status: commandResult.code === 0 ? "completed" : "failed",
      risk: "P0",
      authRequired: false,
      externalServices: ["Next.js", "OpenNext Cloudflare"],
      startedAt,
      finishedAt: nowIso(),
      stats: commandResult.code === 0 ? computeStats([commandResult.durationMs]) : null,
      memory: null,
      bundleImpact: {
        chunkCount: 0,
        routeChunkBytes: 0,
        apiChunkBytes: 0,
        totalChunkBytes: 0,
        clientSourceBytes: 0,
        serverSourceBytes: 0,
        buildArtifactBytes,
        openNextArtifactBytes,
      },
      notes: dedupeNotes([
        commandResult.code === 0 ? "Build completed successfully." : `Build failed with exit code ${commandResult.code ?? "unknown"}.`,
        commandResult.stderr.trim().split("\n").slice(-3).join(" ").trim(),
      ]),
      metadata: {
        scriptName,
        exitCode: commandResult.code,
        durationMs: commandResult.durationMs,
      },
    })
  }

  return results
}

async function runFeatureBundleSizeBenchmarks(
  features: FeatureManifestEntry[],
): Promise<BenchmarkResult[]> {
  const manifestPath = resolveProjectPath(".next", "app-build-manifest.json")
  if (!(await pathExists(manifestPath))) {
    return features
      .filter((feature) => feature.bundleBenchmarks && feature.bundleBenchmarks.length > 0)
      .map((feature) => ({
        id: `${feature.id}:bundle-size`,
        featureId: feature.id,
        featureName: feature.name,
        category: feature.category,
        benchmarkType: "bundle-size",
        targetKind: "bundle" as const,
        target: feature.routes.join(", ") || feature.apiEndpoints.join(", "),
        status: "skipped" as const,
        risk: feature.benchmarkPriority,
        authRequired: feature.authRequired,
        externalServices: feature.externalServices,
        startedAt: nowIso(),
        finishedAt: nowIso(),
        stats: null,
        memory: null,
        bundleImpact: null,
        notes: [".next/app-build-manifest.json not found. Run a build before bundle analysis."],
        metadata: {},
      }))
  }

  const appBuildManifest = await readJsonFile<AppBuildManifest>(manifestPath)
  const pageChunks = appBuildManifest.pages ?? {}
  const buildArtifactBytes = await measureDirectoryBytes(resolveProjectPath(".next"))
  const openNextArtifactBytes = await measureDirectoryBytes(resolveProjectPath(".open-next"))
  const results: BenchmarkResult[] = []

  for (const feature of features) {
    const specs = feature.bundleBenchmarks ?? []
    if (specs.length === 0) continue

    const combined = combineBundleSpecs(specs)
    const routeKeys = combined.routes.map(routeToManifestKey)
    const apiKeys = combined.apiRoutes.map(apiToManifestKey)
    const routeMetrics = await sumManifestChunks(pageChunks, routeKeys)
    const apiMetrics = await sumManifestChunks(pageChunks, apiKeys)
    const clientSourceBytes = await sumFileSizes(
      combined.importTargets
        .map((target) => resolveProjectPath(target))
        .filter((targetPath) => targetPath.includes(`${path.sep}app${path.sep}`) || targetPath.includes(`${path.sep}components${path.sep}`) || targetPath.includes(`${path.sep}hooks${path.sep}`)),
    )
    const serverSourceBytes = await sumFileSizes(
      feature.serverFiles.map((target) => resolveProjectPath(target)),
    )

    results.push({
      id: `${feature.id}:bundle-size`,
      featureId: feature.id,
      featureName: feature.name,
      category: feature.category,
      benchmarkType: "bundle-size",
      targetKind: "bundle",
      target: combined.routes.concat(combined.apiRoutes).join(", "),
      status: "completed",
      risk: feature.benchmarkPriority,
      authRequired: feature.authRequired,
      externalServices: feature.externalServices,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      stats: null,
      memory: null,
      bundleImpact: {
        chunkCount: routeMetrics.chunkCount + apiMetrics.chunkCount,
        routeChunkBytes: routeMetrics.totalBytes,
        apiChunkBytes: apiMetrics.totalBytes,
        totalChunkBytes: routeMetrics.totalBytes + apiMetrics.totalBytes,
        clientSourceBytes,
        serverSourceBytes,
        buildArtifactBytes,
        openNextArtifactBytes,
      },
      notes: dedupeNotes([
        combined.notes.join(" ").trim(),
        routeMetrics.missingKeys.length > 0 ? `Missing route manifest keys: ${routeMetrics.missingKeys.join(", ")}` : undefined,
        apiMetrics.missingKeys.length > 0 ? `Missing API manifest keys: ${apiMetrics.missingKeys.join(", ")}` : undefined,
      ]),
      metadata: {
        routeManifestKeys: routeKeys,
        apiManifestKeys: apiKeys,
        routeChunkFiles: routeMetrics.chunkFiles,
        apiChunkFiles: apiMetrics.chunkFiles,
      },
    })
  }

  return results
}

async function runImportCostBenchmarks(
  features: FeatureManifestEntry[],
  context: BundleBenchmarkContext,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  for (const feature of features) {
    const specs = feature.bundleBenchmarks ?? []
    const importTargets = [...new Set(specs.flatMap((spec) => spec.importTargets ?? []))]
    for (const importTarget of importTargets) {
      const startedAt = nowIso()
      if (context.dryRun) {
        results.push({
          id: `${feature.id}:import:${importTarget}`,
          featureId: feature.id,
          featureName: feature.name,
          category: feature.category,
          benchmarkType: "render-import-cost",
          targetKind: "import",
          target: importTarget,
          status: "skipped",
          risk: feature.benchmarkPriority,
          authRequired: feature.authRequired,
          externalServices: feature.externalServices,
          startedAt,
          finishedAt: nowIso(),
          stats: null,
          memory: null,
          bundleImpact: null,
          notes: ["Dry-run mode enabled; module import was not executed."],
          metadata: {},
        })
        continue
      }

      const absoluteImportTarget = resolveProjectPath(importTarget)
      if (!(await pathExists(absoluteImportTarget))) {
        results.push({
          id: `${feature.id}:import:${importTarget}`,
          featureId: feature.id,
          featureName: feature.name,
          category: feature.category,
          benchmarkType: "render-import-cost",
          targetKind: "import",
          target: importTarget,
          status: "skipped",
          risk: feature.benchmarkPriority,
          authRequired: feature.authRequired,
          externalServices: feature.externalServices,
          startedAt,
          finishedAt: nowIso(),
          stats: null,
          memory: null,
          bundleImpact: null,
          notes: [`Import target not found: ${importTarget}`],
          metadata: {},
        })
        continue
      }

      try {
        const initialMemory = await getRuntimeMemorySnapshot()
        let peakMemory = initialMemory
        for (let warmupIndex = 0; warmupIndex < context.warmupIterations; warmupIndex += 1) {
          await import(`${pathToFileURL(absoluteImportTarget).href}?warmup=${Date.now()}-${warmupIndex}`)
          peakMemory = mergePeakMemory(peakMemory, await getRuntimeMemorySnapshot())
        }

        const samplesMs: number[] = []
        for (let iteration = 0; iteration < context.iterations; iteration += 1) {
          const started = performance.now()
          await import(`${pathToFileURL(absoluteImportTarget).href}?sample=${Date.now()}-${iteration}`)
          const elapsed = performance.now() - started
          samplesMs.push(roundMetric(elapsed))
          peakMemory = mergePeakMemory(peakMemory, await getRuntimeMemorySnapshot())
        }

        const finalMemory = await getRuntimeMemorySnapshot()
        results.push({
          id: `${feature.id}:import:${importTarget}`,
          featureId: feature.id,
          featureName: feature.name,
          category: feature.category,
          benchmarkType: "render-import-cost",
          targetKind: "import",
          target: importTarget,
          status: "completed",
          risk: feature.benchmarkPriority,
          authRequired: feature.authRequired,
          externalServices: feature.externalServices,
          startedAt,
          finishedAt: nowIso(),
          stats: computeStats(samplesMs),
          memory: buildMemoryStats(initialMemory, finalMemory, peakMemory),
          bundleImpact: null,
          notes: [],
          metadata: {
            iterations: context.iterations,
            warmupIterations: context.warmupIterations,
          },
        })
      } catch (error) {
        results.push({
          id: `${feature.id}:import:${importTarget}`,
          featureId: feature.id,
          featureName: feature.name,
          category: feature.category,
          benchmarkType: "render-import-cost",
          targetKind: "import",
          target: importTarget,
          status: "skipped",
          risk: feature.benchmarkPriority,
          authRequired: feature.authRequired,
          externalServices: feature.externalServices,
          startedAt,
          finishedAt: nowIso(),
          stats: null,
          memory: null,
          bundleImpact: null,
          notes: [
            `Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: ${formatError(error)}`,
          ],
          metadata: {},
        })
      }
    }
  }

  return results
}

function combineBundleSpecs(specs: BundleBenchmarkSpec[]) {
  return {
    routes: [...new Set(specs.flatMap((spec) => spec.routes ?? []))],
    apiRoutes: [...new Set(specs.flatMap((spec) => spec.apiRoutes ?? []))],
    importTargets: [...new Set(specs.flatMap((spec) => spec.importTargets ?? []))],
    notes: specs.map((spec) => spec.notes ?? "").filter(Boolean),
  }
}

function routeToManifestKey(route: string): string {
  if (route === "/") return "/page"
  return `${route}/page`
}

function apiToManifestKey(apiRoute: string): string {
  return `${apiRoute}/route`
}

async function sumManifestChunks(
  manifestPages: Record<string, string[]>,
  manifestKeys: string[],
): Promise<{ totalBytes: number; chunkCount: number; chunkFiles: string[]; missingKeys: string[] }> {
  const chunkFiles = new Set<string>()
  const missingKeys: string[] = []

  for (const manifestKey of manifestKeys) {
    const files = manifestPages[manifestKey]
    if (!files) {
      missingKeys.push(manifestKey)
      continue
    }
    files.forEach((file) => chunkFiles.add(file))
  }

  const absoluteChunkFiles = [...chunkFiles].map((file) => resolveProjectPath(".next", file))
  const totalBytes = await sumFileSizes(absoluteChunkFiles)
  return {
    totalBytes,
    chunkCount: chunkFiles.size,
    chunkFiles: [...chunkFiles],
    missingKeys,
  }
}

async function measureDirectoryBytes(targetPath: string): Promise<number> {
  if (!(await pathExists(targetPath))) return 0
  const files = await collectFilesRecursive(targetPath)
  return sumFileSizes(files)
}

function summarizeResults(results: BenchmarkResult[]) {
  return {
    total: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
  }
}

function selectFeatures(featureIds: string[]): FeatureManifestEntry[] {
  if (featureIds.length === 0) {
    return featureManifest.filter((feature) => feature.bundleBenchmarks && feature.bundleBenchmarks.length > 0)
  }

  const selected: FeatureManifestEntry[] = []
  for (const featureId of featureIds) {
    const feature = featureManifestById.get(featureId)
    if (!feature) {
      throw new Error(`Unknown feature id: ${featureId}`)
    }
    selected.push(feature)
  }
  return selected
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      renderUsage("tsx benchmarks/bundle-benchmark.ts", [
        "Runs build-time, bundle-size, and import-cost benchmarks.",
        "",
        "Options:",
        "  --feature <id>           Run only specific feature ids (repeat or comma separate).",
        "  --all                    Explicitly run all feature bundle benchmarks.",
        "  --dry-run                Plan the run without building or importing modules.",
        "  --iterations <n>         Import-cost sample count. Default: 10.",
        "  --warmups <n>            Import-cost warmup sample count. Default: 2.",
        "  --output <path>          Override JSON results path.",
      ]),
    )
    return
  }

  const selectedFeatures = selectFeatures(args.all ? [] : args.featureIds)
  const startedAtMs = Date.now()
  const runId = createRunId("bundle-bench")
  const results = await runBundleBenchmarks(selectedFeatures, {
    executeBuild: true,
    dryRun: args.dryRun,
    iterations: args.iterations,
    warmupIterations: args.warmupIterations,
  })

  const summary = summarizeResults(results)
  const output: BenchmarkRunOutput = {
    schemaVersion: 1,
    runId,
    generatedAt: nowIso(),
    cwd: resolveProjectPath(),
    baseline: args.baseline,
    selectedFeatures: selectedFeatures.map((feature) => feature.id),
    cli: args,
    summary: {
      ...summary,
      durationMs: Date.now() - startedAtMs,
    },
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      managedServer: false,
      baseUrl: null,
    },
    results,
  }

  const outputPath =
    args.outputPath ??
    path.join(BENCHMARK_RESULTS_DIR, `${runId}.json`)

  await writeJsonFile(outputPath, output)
  console.log(`Wrote bundle benchmark results to ${outputPath}`)
  console.log(
    `Completed: ${summary.completed}, skipped: ${summary.skipped}, failed: ${summary.failed}`,
  )
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (invokedPath === path.resolve(resolveProjectPath("benchmarks", "bundle-benchmark.ts"))) {
  void main().catch((error) => {
    console.error(formatError(error))
    process.exitCode = 1
  })
}
