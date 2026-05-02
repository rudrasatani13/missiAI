import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"
import { runApiBenchmark } from "./api-benchmark"
import { runBundleBenchmarks } from "./bundle-benchmark"
import {
  BENCHMARK_DOCS_DIR,
  BENCHMARK_RESULTS_DIR,
  buildHeaders,
  createRunId,
  dedupeNotes,
  formatError,
  nowIso,
  parseCliArgs,
  renderUsage,
  resolveProjectPath,
  sleep,
  type BenchmarkResult,
  type BenchmarkRunOutput,
} from "./benchmark-utils"
import { featureManifest, featureManifestById } from "./feature-manifest"
import { runHttpBenchmark, type HttpBenchmarkContext } from "./http-benchmark"
import { writeRunReport } from "./report-writer"
import { runServerFunctionBenchmark } from "./server-function-benchmark"
import { writeJsonFile } from "./benchmark-utils"

interface ManagedServerHandle {
  child: ChildProcess
  baseUrl: string
  pid?: number
  getLogs: () => { stdout: string; stderr: string }
  stop: () => Promise<void>
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))

  if (args.help) {
    console.log(
      renderUsage("tsx benchmarks/run-feature-benchmarks.ts", [
        "Runs feature-wise HTTP, API, server-function, and optional build/bundle benchmarks.",
        "",
        "Options:",
        "  --all                    Run all discovered feature groups.",
        "  --feature <id>           Run a single feature id (repeat or comma separate).",
        "  --list                   Print discovered feature ids and exit.",
        "  --baseline               Also run build/bundle benchmarks and write BASELINE_REPORT.md.",
        "  --with-build             Include build/bundle benchmarks without baseline mode.",
        "  --base-url <url>         Benchmark against an already running app server.",
        "  --server-command <cmd>   Start a local server command before running HTTP/API benchmarks.",
        "  --port <n>               Port used with --server-command. Default: 3000.",
        "  --allow-authenticated    Allow auth-required routes/APIs when auth headers/cookies are supplied.",
        "  --cookie <value>         Benchmark session cookie for authenticated routes.",
        "  --auth-header <k:v>      Extra auth header, for example Authorization: Bearer <token>.",
        "  --allow-external-calls   Opt into live provider or webhook traffic when fixtures are not available.",
        "  --iterations <n>         Sample count per benchmark. Default: 10.",
        "  --warmups <n>            Warmup count per benchmark. Default: 2.",
        "  --dry-run                Plan the run without executing benchmark work.",
      ]),
    )
    return
  }

  if (args.list) {
    for (const feature of featureManifest) {
      console.log(`${feature.id} - ${feature.name}`)
    }
    return
  }

  if (!args.all && args.featureIds.length === 0) {
    console.log(
      renderUsage("tsx benchmarks/run-feature-benchmarks.ts", [
        "No features selected. Use --all, --feature <id>, or --list.",
      ]),
    )
    return
  }

  const selectedFeatures = args.all
    ? featureManifest
    : args.featureIds.map((featureId) => {
        const feature = featureManifestById.get(featureId)
        if (!feature) {
          throw new Error(`Unknown feature id: ${featureId}`)
        }
        return feature
      })

  const startedAtMs = Date.now()
  const runId = createRunId(args.baseline ? "baseline-bench" : "feature-bench")
  let managedServer: ManagedServerHandle | null = null

  try {
    if (args.serverCommand) {
      managedServer = await startManagedServer(args.serverCommand, args.port, args.readinessPath, args.timeoutMs)
    }

    const baseUrl = args.baseUrl ?? managedServer?.baseUrl ?? null
    const requestHeaders = buildHeaders(args)
    const httpContext: HttpBenchmarkContext = {
      baseUrl,
      requestHeaders,
      allowAuthenticated: args.allowAuthenticated,
      allowExternalCalls: args.allowExternalCalls,
      dryRun: args.dryRun,
      iterations: args.iterations,
      warmupIterations: args.warmupIterations,
      timeoutMs: args.timeoutMs,
      managedServerPid: managedServer?.pid,
    }

    const results: BenchmarkResult[] = []

    for (const feature of selectedFeatures) {
      for (const spec of feature.httpBenchmarks ?? []) {
        results.push(
          await runHttpBenchmark({
            feature,
            spec,
            context: httpContext,
            benchmarkType: "http-route-latency",
            targetKind: "route",
          }),
        )
      }

      for (const spec of feature.apiBenchmarks ?? []) {
        results.push(await runApiBenchmark(feature, spec, httpContext))
      }

      for (const spec of feature.serverBenchmarks ?? []) {
        results.push(
          await runServerFunctionBenchmark({
            feature,
            spec,
            context: {
              iterations: args.iterations,
              warmupIterations: args.warmupIterations,
              dryRun: args.dryRun,
              allowExternalCalls: args.allowExternalCalls,
            },
          }),
        )
      }
    }

    if (args.baseline || args.includeBuild) {
      results.push(
        ...(await runBundleBenchmarks(selectedFeatures, {
          executeBuild: true,
          dryRun: args.dryRun,
          iterations: args.iterations,
          warmupIterations: args.warmupIterations,
        })),
      )
    }

    if (managedServer) {
      await managedServer.stop()
    }

    const output: BenchmarkRunOutput = {
      schemaVersion: 1,
      runId,
      generatedAt: nowIso(),
      cwd: resolveProjectPath(),
      baseline: args.baseline,
      selectedFeatures: selectedFeatures.map((feature) => feature.id),
      cli: args,
      summary: {
        total: results.length,
        completed: results.filter((result) => result.status === "completed").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
        durationMs: Date.now() - startedAtMs,
      },
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        managedServer: Boolean(args.serverCommand),
        baseUrl,
      },
      results,
    }

    const outputPath =
      args.outputPath ??
      path.join(BENCHMARK_RESULTS_DIR, `${runId}.json`)
    const markdownPath =
      args.markdownPath ??
      path.join(BENCHMARK_DOCS_DIR, args.baseline ? "BASELINE_REPORT.md" : "LATEST_RUN_REPORT.md")

    await writeJsonFile(outputPath, output)
    await writeRunReport(output, markdownPath, args.baseline ? "Baseline Report" : "Latest Benchmark Run")

    console.log(`Wrote JSON results to ${outputPath}`)
    console.log(`Wrote Markdown report to ${markdownPath}`)
    console.log(
      `Completed: ${output.summary.completed}, skipped: ${output.summary.skipped}, failed: ${output.summary.failed}`,
    )
  } catch (error) {
    if (managedServer) {
      try {
        await managedServer.stop()
      } catch {
        // Preserve the original error.
      }
      const logs = managedServer.getLogs()
      throw new Error(
        dedupeNotes([
          formatError(error),
          logs.stderr.trim().split("\n").slice(-5).join(" ").trim(),
        ]).join(" | "),
      )
    }
    throw error
  }
}

async function startManagedServer(
  serverCommand: string,
  port: number,
  readinessPath: string,
  timeoutMs: number,
): Promise<ManagedServerHandle> {
  const child = spawn(serverCommand, {
    cwd: resolveProjectPath(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const baseUrl = `http://127.0.0.1:${port}`
  const readinessUrl = new URL(readinessPath, baseUrl).toString()
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Managed server exited early with code ${child.exitCode}`)
    }

    try {
      const response = await fetch(readinessUrl)
      if (response.ok) {
        return {
          child,
          baseUrl,
          pid: child.pid,
          getLogs: () => ({ stdout, stderr }),
          stop: () => stopManagedServer(child),
        }
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for managed server readiness at ${readinessUrl}`)
}

async function stopManagedServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return

  child.kill("SIGTERM")
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
    }, 5_000)

    child.once("close", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (invokedPath === path.resolve(resolveProjectPath("benchmarks", "run-feature-benchmarks.ts"))) {
  void main().catch((error) => {
    console.error(formatError(error))
    process.exitCode = 1
  })
}
