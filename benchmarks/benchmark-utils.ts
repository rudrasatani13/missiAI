import { constants as fsConstants } from "node:fs"
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type BenchmarkType =
  | "http-route-latency"
  | "api-latency"
  | "server-function-benchmark"
  | "build-time"
  | "bundle-size"
  | "render-import-cost"
  | "memory-usage"
  | "mocked-integration-benchmark"

export type BenchmarkStatus = "completed" | "skipped" | "failed"

export interface BenchmarkStats {
  count: number
  samplesMs: number[]
  p50: number
  p75: number
  p95: number
  average: number
  min: number
  max: number
  stdDev: number
}

export interface MemorySnapshot {
  rssBytes: number | null
  heapUsedBytes: number | null
  externalBytes: number | null
  arrayBuffersBytes: number | null
}

export interface MemoryStats {
  rssStartBytes: number | null
  rssEndBytes: number | null
  rssPeakBytes: number | null
  rssDeltaBytes: number | null
  heapUsedStartBytes: number | null
  heapUsedEndBytes: number | null
  heapUsedPeakBytes: number | null
  heapUsedDeltaBytes: number | null
}

export interface BundleImpact {
  chunkCount: number
  routeChunkBytes: number
  apiChunkBytes: number
  totalChunkBytes: number
  clientSourceBytes: number
  serverSourceBytes: number
  buildArtifactBytes: number
  openNextArtifactBytes: number
}

export interface BenchmarkResult {
  id: string
  featureId: string
  featureName: string
  category: string
  benchmarkType: BenchmarkType
  targetKind: "route" | "api" | "function" | "build" | "bundle" | "import" | "integration"
  target: string
  status: BenchmarkStatus
  risk: string
  authRequired: boolean
  externalServices: string[]
  startedAt: string
  finishedAt: string
  stats: BenchmarkStats | null
  memory: MemoryStats | null
  bundleImpact: BundleImpact | null
  notes: string[]
  metadata: Record<string, unknown>
}

export interface ParsedCliArgs {
  help: boolean
  all: boolean
  baseline: boolean
  compare: boolean
  list: boolean
  dryRun: boolean
  includeBuild: boolean
  allowAuthenticated: boolean
  allowExternalCalls: boolean
  featureIds: string[]
  baseUrl: string | null
  cookie: string | null
  authHeader: string | null
  serverCommand: string | null
  readinessPath: string
  port: number
  timeoutMs: number
  iterations: number
  warmupIterations: number
  outputPath: string | null
  markdownPath: string | null
}

export interface BenchmarkRunOutput {
  schemaVersion: number
  runId: string
  generatedAt: string
  cwd: string
  baseline: boolean
  selectedFeatures: string[]
  cli: ParsedCliArgs
  summary: {
    total: number
    completed: number
    skipped: number
    failed: number
    durationMs: number
  }
  metadata: {
    nodeVersion: string
    platform: NodeJS.Platform
    arch: string
    managedServer: boolean
    baseUrl: string | null
  }
  results: BenchmarkResult[]
}

export interface RunCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export interface RunCommandResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const PROJECT_ROOT = path.resolve(__dirname, "..")
export const BENCHMARKS_ROOT = path.join(PROJECT_ROOT, "benchmarks")
export const BENCHMARK_RESULTS_DIR = path.join(BENCHMARKS_ROOT, "results")
export const BENCHMARK_DOCS_DIR = path.join(PROJECT_ROOT, "docs", "benchmarks")

export function resolveProjectPath(...segments: string[]): string {
  return path.join(PROJECT_ROOT, ...segments)
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true })
}

export async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(targetPath))
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function writeTextFile(targetPath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(targetPath))
  await writeFile(targetPath, contents, "utf8")
}

export async function readJsonFile<T>(targetPath: string): Promise<T> {
  const raw = await readFile(targetPath, "utf8")
  return JSON.parse(raw) as T
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function createRunId(prefix = "feature-bench"): string {
  const stamp = nowIso().replace(/[:.]/g, "-")
  return `${prefix}-${stamp}`
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  )
  return roundMetric(sorted[index] ?? 0)
}

export function computeStats(samplesMs: number[]): BenchmarkStats | null {
  if (samplesMs.length === 0) return null
  const count = samplesMs.length
  const total = samplesMs.reduce((sum, value) => sum + value, 0)
  const average = total / count
  const variance =
    samplesMs.reduce((sum, value) => sum + (value - average) ** 2, 0) / count

  return {
    count,
    samplesMs: samplesMs.map((value) => roundMetric(value)),
    p50: percentile(samplesMs, 50),
    p75: percentile(samplesMs, 75),
    p95: percentile(samplesMs, 95),
    average: roundMetric(average),
    min: roundMetric(Math.min(...samplesMs)),
    max: roundMetric(Math.max(...samplesMs)),
    stdDev: roundMetric(Math.sqrt(variance)),
  }
}

export function roundMetric(value: number): number {
  return Number(value.toFixed(3))
}

export function bytesToHuman(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "n/a"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

export function durationToHuman(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "n/a"
  if (durationMs < 1000) return `${roundMetric(durationMs)} ms`
  return `${roundMetric(durationMs / 1000)} s`
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = {
    help: false,
    all: false,
    baseline: false,
    compare: false,
    list: false,
    dryRun: false,
    includeBuild: false,
    allowAuthenticated: false,
    allowExternalCalls: false,
    featureIds: [],
    baseUrl: process.env.BENCH_BASE_URL ?? null,
    cookie: process.env.BENCH_COOKIE ?? null,
    authHeader: process.env.BENCH_AUTH_HEADER ?? null,
    serverCommand: process.env.BENCH_SERVER_COMMAND ?? null,
    readinessPath: process.env.BENCH_READINESS_PATH ?? "/api/health",
    port: parseInteger(process.env.BENCH_PORT ?? "3000", "--port"),
    timeoutMs: parseInteger(process.env.BENCH_TIMEOUT_MS ?? "15000", "--timeout-ms"),
    iterations: parseInteger(process.env.BENCH_ITERATIONS ?? "10", "--iterations"),
    warmupIterations: parseInteger(process.env.BENCH_WARMUPS ?? "2", "--warmups"),
    outputPath: null,
    markdownPath: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--":
        break
      case "--help":
      case "-h":
        args.help = true
        break
      case "--all":
        args.all = true
        break
      case "--baseline":
        args.baseline = true
        break
      case "--compare":
        args.compare = true
        break
      case "--list":
        args.list = true
        break
      case "--dry-run":
        args.dryRun = true
        break
      case "--with-build":
        args.includeBuild = true
        break
      case "--allow-authenticated":
        args.allowAuthenticated = true
        break
      case "--allow-external-calls":
        args.allowExternalCalls = true
        break
      case "--feature": {
        const next = argv[index + 1]
        if (!next) throw new Error("Missing value after --feature")
        args.featureIds.push(...next.split(",").map((value) => value.trim()).filter(Boolean))
        index += 1
        break
      }
      case "--base-url":
        args.baseUrl = requireValue(token, argv, ++index)
        break
      case "--cookie":
        args.cookie = requireValue(token, argv, ++index)
        args.allowAuthenticated = true
        break
      case "--auth-header":
        args.authHeader = requireValue(token, argv, ++index)
        args.allowAuthenticated = true
        break
      case "--server-command":
        args.serverCommand = requireValue(token, argv, ++index)
        break
      case "--readiness-path":
        args.readinessPath = requireValue(token, argv, ++index)
        break
      case "--port":
        args.port = parseInteger(requireValue(token, argv, ++index), token)
        break
      case "--timeout-ms":
        args.timeoutMs = parseInteger(requireValue(token, argv, ++index), token)
        break
      case "--iterations":
        args.iterations = parseInteger(requireValue(token, argv, ++index), token)
        break
      case "--warmups":
        args.warmupIterations = parseInteger(requireValue(token, argv, ++index), token)
        break
      case "--output":
        args.outputPath = requireValue(token, argv, ++index)
        break
      case "--markdown":
        args.markdownPath = requireValue(token, argv, ++index)
        break
      default:
        throw new Error(`Unknown flag: ${token}`)
    }
  }

  return args
}

export function renderUsage(scriptName: string, body: string[]): string {
  return [
    `Usage: ${scriptName} [options]`,
    "",
    ...body,
  ].join("\n")
}

export function requireValue(flagName: string, argv: string[], index: number): string {
  const value = argv[index]
  if (!value) throw new Error(`Missing value after ${flagName}`)
  return value
}

export function parseInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value for ${flagName}: ${value}`)
  }
  return parsed
}

export function buildHeaders(args: ParsedCliArgs): Record<string, string> {
  const headers: Record<string, string> = {}
  if (args.authHeader) {
    const [name, ...rest] = args.authHeader.split(":")
    if (name && rest.length > 0) {
      headers[name.trim()] = rest.join(":").trim()
    }
  }
  if (args.cookie) {
    headers.cookie = args.cookie
  }
  return headers
}

export async function runCommand(
  command: string,
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  const startedAt = Date.now()
  const child = spawn(command, {
    cwd: options.cwd ?? PROJECT_ROOT,
    env: { ...process.env, ...options.env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""
  let timeoutHandle: NodeJS.Timeout | undefined

  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM")
    }, options.timeoutMs)
  }

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const settled = await new Promise<RunCommandResult>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code, signal) => {
      resolve({
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      })
    })
  })

  if (timeoutHandle) clearTimeout(timeoutHandle)
  return settled
}

export async function collectFilesRecursive(targetPath: string): Promise<string[]> {
  if (!(await pathExists(targetPath))) return []
  const directoryEntries = await readdir(targetPath, { withFileTypes: true })
  const nested = await Promise.all(
    directoryEntries.map(async (entry) => {
      const entryPath = path.join(targetPath, entry.name)
      if (entry.isDirectory()) {
        return collectFilesRecursive(entryPath)
      }
      return [entryPath]
    }),
  )
  return nested.flat()
}

export async function sumFileSizes(pathsToSum: string[]): Promise<number> {
  const sizes = await Promise.all(
    pathsToSum.map(async (filePath) => {
      try {
        const fileStats = await stat(filePath)
        return fileStats.size
      } catch {
        return 0
      }
    }),
  )
  return sizes.reduce((sum, value) => sum + value, 0)
}

export async function getRuntimeMemorySnapshot(): Promise<MemorySnapshot> {
  const usage = process.memoryUsage()
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  }
}

export async function getProcessMemorySnapshot(pid: number): Promise<MemorySnapshot> {
  if (!Number.isFinite(pid) || pid <= 0) {
    return emptyMemorySnapshot()
  }

  if (os.platform() === "win32") {
    return emptyMemorySnapshot()
  }

  const result = await runCommand(`ps -o rss= -p ${pid}`, {
    cwd: PROJECT_ROOT,
    timeoutMs: 2_000,
  })

  if (result.code !== 0) {
    return emptyMemorySnapshot()
  }

  const rssKb = Number.parseInt(result.stdout.trim(), 10)
  return {
    rssBytes: Number.isFinite(rssKb) ? rssKb * 1024 : null,
    heapUsedBytes: null,
    externalBytes: null,
    arrayBuffersBytes: null,
  }
}

export function emptyMemorySnapshot(): MemorySnapshot {
  return {
    rssBytes: null,
    heapUsedBytes: null,
    externalBytes: null,
    arrayBuffersBytes: null,
  }
}

export function mergePeakMemory(
  currentPeak: MemorySnapshot | null,
  candidate: MemorySnapshot,
): MemorySnapshot {
  const peak = currentPeak ?? emptyMemorySnapshot()
  return {
    rssBytes: maxNullable(peak.rssBytes, candidate.rssBytes),
    heapUsedBytes: maxNullable(peak.heapUsedBytes, candidate.heapUsedBytes),
    externalBytes: maxNullable(peak.externalBytes, candidate.externalBytes),
    arrayBuffersBytes: maxNullable(peak.arrayBuffersBytes, candidate.arrayBuffersBytes),
  }
}

export function buildMemoryStats(
  start: MemorySnapshot | null,
  end: MemorySnapshot | null,
  peak: MemorySnapshot | null,
): MemoryStats | null {
  if (!start && !end && !peak) return null
  return {
    rssStartBytes: start?.rssBytes ?? null,
    rssEndBytes: end?.rssBytes ?? null,
    rssPeakBytes: peak?.rssBytes ?? end?.rssBytes ?? start?.rssBytes ?? null,
    rssDeltaBytes: subtractNullable(end?.rssBytes ?? null, start?.rssBytes ?? null),
    heapUsedStartBytes: start?.heapUsedBytes ?? null,
    heapUsedEndBytes: end?.heapUsedBytes ?? null,
    heapUsedPeakBytes: peak?.heapUsedBytes ?? end?.heapUsedBytes ?? start?.heapUsedBytes ?? null,
    heapUsedDeltaBytes: subtractNullable(end?.heapUsedBytes ?? null, start?.heapUsedBytes ?? null),
  }
}

export function subtractNullable(
  endValue: number | null,
  startValue: number | null,
): number | null {
  if (endValue === null || startValue === null) return null
  return endValue - startValue
}

export function maxNullable(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

export function dedupeNotes(notes: Array<string | null | undefined>): string[] {
  return [...new Set(notes.map((note) => note?.trim()).filter((note): note is string => Boolean(note)))]
}

export async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

export async function listLatestResultFiles(limit = 2): Promise<string[]> {
  const files = await collectFilesRecursive(BENCHMARK_RESULTS_DIR)
  const jsonFiles = files.filter((filePath) => filePath.endsWith(".json"))
  const statsByFile = await Promise.all(
    jsonFiles.map(async (filePath) => ({
      filePath,
      modifiedAt: (await stat(filePath)).mtimeMs,
    })),
  )

  return statsByFile
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(0, limit)
    .map((entry) => entry.filePath)
}
