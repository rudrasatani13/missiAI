const INJECTION_PHRASES: RegExp[] = [
  /ignore\s+(all|previous|above)\s+instructions?/gi,
  /you\s+are\s+now\b/gi,
  /\bact\s+as\b/gi,
  /\bpretend\s+to\s+be\b/gi,
]

const MAX_CHARS = 3000

/**
 * Strip prompt-injection patterns from a memory string before injecting
 * it into any AI system prompt. Also enforces a hard character cap.
 */
export function sanitizeMemories(raw: string): string {
  let result = raw

  // Remove known instruction-override phrases (case-insensitive)
  for (const pattern of INJECTION_PHRASES) {
    result = result.replace(pattern, "")
  }

  // Drop any line that starts with a role prefix or markdown heading/divider,
  // as these can hijack how the model interprets the memory block.
  result = result
    .split("\n")
    .filter((line) => {
      const t = line.trimStart()
      return (
        !/^system\s*:/i.test(t) &&
        !/^assistant\s*:/i.test(t) &&
        !/^user\s*:/i.test(t) &&
        !t.startsWith("###") &&
        !t.startsWith("---")
      )
    })
    .join("\n")

  return result.slice(0, MAX_CHARS).trim()
}
