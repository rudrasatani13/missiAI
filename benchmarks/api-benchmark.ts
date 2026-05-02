import type { HttpBenchmarkSpec, FeatureManifestEntry } from "./feature-manifest"
import type { HttpBenchmarkContext } from "./http-benchmark"
import { runHttpBenchmark } from "./http-benchmark"

export async function runApiBenchmark(
  feature: FeatureManifestEntry,
  spec: HttpBenchmarkSpec,
  context: HttpBenchmarkContext,
) {
  return runHttpBenchmark({
    feature,
    spec,
    context,
    benchmarkType: "api-latency",
    targetKind: spec.requiresMocking ? "integration" : "api",
  })
}
