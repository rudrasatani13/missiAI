import path from "node:path"
import type { BenchmarkResult, BenchmarkRunOutput } from "./benchmark-utils"
import {
  BENCHMARK_DOCS_DIR,
  bytesToHuman,
  durationToHuman,
  formatError,
  listLatestResultFiles,
  nowIso,
  parseCliArgs,
  readJsonFile,
  renderUsage,
  resolveProjectPath,
  roundMetric,
  writeTextFile,
} from "./benchmark-utils"

export async function writeRunReport(
  run: BenchmarkRunOutput,
  outputPath: string,
  title: string,
): Promise<void> {
  const markdown = renderRunReport(run, title)
  await writeTextFile(outputPath, markdown)
}

export async function writeCompareReport(
  baseRun: BenchmarkRunOutput,
  headRun: BenchmarkRunOutput,
  outputPath: string,
): Promise<void> {
  const markdown = renderCompareReport(baseRun, headRun)
  await writeTextFile(outputPath, markdown)
}

export function renderRunReport(run: BenchmarkRunOutput, title: string): string {
  const lines = [
    `# ${title}`,
    "",
    `Generated: ${run.generatedAt}`,
    `Run ID: ${run.runId}`,
    `Selected features: ${run.selectedFeatures.join(", ") || "n/a"}`,
    `Baseline mode: ${run.baseline ? "yes" : "no"}`,
    `Base URL: ${run.metadata.baseUrl ?? "n/a"}`,
    "",
    "## Summary",
    `- Completed: ${run.summary.completed}`,
    `- Skipped: ${run.summary.skipped}`,
    `- Failed: ${run.summary.failed}`,
    `- Duration: ${durationToHuman(run.summary.durationMs)}`,
    "",
    "## Risk Labels",
    "- P0 = critical performance issue",
    "- P1 = high-impact optimization",
    "- P2 = medium improvement",
    "- P3 = nice-to-have",
    "",
    "## Results",
    "",
    "| Feature | Benchmark Type | Route/API/Function | p50 | p75 | p95 | Avg | Min | Max | Memory | Bundle Impact | Risk | Status | Notes |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ...run.results.map(renderResultRow),
    "",
  ]

  return lines.join("\n")
}

export function renderCompareReport(
  baseRun: BenchmarkRunOutput,
  headRun: BenchmarkRunOutput,
): string {
  const baseMap = new Map(baseRun.results.map((result) => [comparisonKey(result), result]))
  const rows = headRun.results.map((headResult) => {
    const baseResult = baseMap.get(comparisonKey(headResult))
    return renderCompareRow(baseResult, headResult)
  })

  return [
    "# Compare Report",
    "",
    `Generated: ${nowIso()}`,
    `Baseline run: ${baseRun.runId}`,
    `Candidate run: ${headRun.runId}`,
    "",
    "## Risk Labels",
    "- P0 = critical performance issue",
    "- P1 = high-impact optimization",
    "- P2 = medium improvement",
    "- P3 = nice-to-have",
    "",
    "## Comparison",
    "",
    "| Feature | Benchmark Type | Route/API/Function | Before p95 | After p95 | Delta p95 | Before Memory | After Memory | Before Bundle | After Bundle | Risk | Status | Notes |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n")
}

function renderResultRow(result: BenchmarkResult): string {
  return [
    escapeCell(result.featureName),
    prettyBenchmarkType(result.benchmarkType),
    escapeCell(result.target),
    formatStat(result.stats?.p50),
    formatStat(result.stats?.p75),
    formatStat(result.stats?.p95),
    formatStat(result.stats?.average),
    formatStat(result.stats?.min),
    formatStat(result.stats?.max),
    escapeCell(formatMemory(result)),
    escapeCell(formatBundle(result)),
    result.risk,
    result.status,
    escapeCell(result.notes.join(" | ") || "—"),
  ].join(" | ")
    .replace(/^/, "| ")
    .concat(" |")
}

function renderCompareRow(
  before: BenchmarkResult | undefined,
  after: BenchmarkResult,
): string {
  const beforeP95 = before?.stats?.p95 ?? null
  const afterP95 = after.stats?.p95 ?? null
  const beforeMemory = before ? formatMemory(before) : "n/a"
  const afterMemory = formatMemory(after)
  const beforeBundle = before ? formatBundle(before) : "n/a"
  const afterBundle = formatBundle(after)

  return [
    escapeCell(after.featureName),
    prettyBenchmarkType(after.benchmarkType),
    escapeCell(after.target),
    formatStat(beforeP95),
    formatStat(afterP95),
    formatDelta(beforeP95, afterP95, "ms"),
    escapeCell(beforeMemory),
    escapeCell(afterMemory),
    escapeCell(beforeBundle),
    escapeCell(afterBundle),
    after.risk,
    after.status,
    escapeCell(after.notes.join(" | ") || "—"),
  ].join(" | ")
    .replace(/^/, "| ")
    .concat(" |")
}

function comparisonKey(result: BenchmarkResult): string {
  return `${result.featureId}::${result.benchmarkType}::${result.target}`
}

function prettyBenchmarkType(benchmarkType: BenchmarkResult["benchmarkType"]): string {
  return benchmarkType
    .split("-")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatStat(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return roundMetric(value).toFixed(3)
}

function formatMemory(result: BenchmarkResult): string {
  const rssDelta = result.memory?.rssDeltaBytes ?? null
  const rssPeak = result.memory?.rssPeakBytes ?? null
  if (rssDelta === null && rssPeak === null) return "n/a"
  return `ΔRSS ${bytesToHuman(rssDelta)} / peak ${bytesToHuman(rssPeak)}`
}

function formatBundle(result: BenchmarkResult): string {
  if (!result.bundleImpact) return "n/a"
  return [
    `chunks ${bytesToHuman(result.bundleImpact.totalChunkBytes)}`,
    `build ${bytesToHuman(result.bundleImpact.buildArtifactBytes)}`,
  ].join(", ")
}

function formatDelta(
  before: number | null,
  after: number | null,
  unit: string,
): string {
  if (before === null || after === null) return "n/a"
  const delta = after - before
  const sign = delta > 0 ? "+" : ""
  return `${sign}${roundMetric(delta)} ${unit}`
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>")
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      renderUsage("tsx benchmarks/report-writer.ts", [
        "Generate Markdown benchmark reports from JSON results.",
        "",
        "Options:",
        "  --compare                Compare the latest two JSON result files.",
        "  --output <path>          Override the Markdown output path.",
      ]),
    )
    return
  }

  if (args.compare) {
    const latestFiles = await listLatestResultFiles(2)
    if (latestFiles.length < 2) {
      throw new Error("At least two benchmark result files are required for --compare.")
    }

    const [headPath, basePath] = latestFiles
    const baseRun = await readJsonFile<BenchmarkRunOutput>(basePath)
    const headRun = await readJsonFile<BenchmarkRunOutput>(headPath)
    const outputPath = args.outputPath ?? path.join(BENCHMARK_DOCS_DIR, "COMPARE_REPORT.md")
    await writeCompareReport(baseRun, headRun, outputPath)
    console.log(`Wrote compare report to ${outputPath}`)
    return
  }

  const latestFiles = await listLatestResultFiles(1)
  if (latestFiles.length === 0) {
    throw new Error("No benchmark result files were found in benchmarks/results.")
  }

  const run = await readJsonFile<BenchmarkRunOutput>(latestFiles[0]!)
  const outputPath =
    args.outputPath ??
    path.join(BENCHMARK_DOCS_DIR, run.baseline ? "BASELINE_REPORT.md" : "LATEST_RUN_REPORT.md")
  await writeRunReport(run, outputPath, run.baseline ? "Baseline Report" : "Latest Benchmark Run")
  console.log(`Wrote run report to ${outputPath}`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (invokedPath === path.resolve(resolveProjectPath("benchmarks", "report-writer.ts"))) {
  void main().catch((error) => {
    console.error(formatError(error))
    process.exitCode = 1
  })
}
