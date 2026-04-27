export interface VisualMemoryResult {
  title: string
  recallHint: string
  tags: string[]
}

export const VISUAL_MEMORY_ANALYZE_ENDPOINT = "/api/v1/visual-memory/analyze"
export const VISUAL_MEMORY_RESULT_TIMEOUT_MS = 8000

export function dataUrlToJpegFile(dataUrl: string, fileName = "visual-memory.jpg"): File {
  const base64Data = dataUrl.split(",")[1] ?? ""
  const binaryStr = atob(base64Data)
  const imgBytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) imgBytes[i] = binaryStr.charCodeAt(i)
  const blob = new Blob([imgBytes], { type: "image/jpeg" })
  return new File([blob], fileName, { type: "image/jpeg" })
}

export function getVisualMemoryErrorMessage(
  status: number,
  data: { code?: string; error?: string } | null | undefined,
): string {
  const code = data?.code ?? ""

  if (status === 413 || code === "PAYLOAD_TOO_LARGE") {
    return "Image too large — please use a photo under 5MB"
  }

  if (status === 415 || code === "UNSUPPORTED_MEDIA_TYPE") {
    return "This file type isn't supported. Try JPEG, PNG, or WebP"
  }

  if (status === 429 || code === "RATE_LIMIT_EXCEEDED") {
    return data?.error ?? "You've reached your daily image limit. Upgrade to Pro for more."
  }

  return "Couldn't save that image. Please try again."
}

export function normalizeVisualMemoryResult(data: Partial<VisualMemoryResult> | null | undefined): VisualMemoryResult {
  return {
    title: data?.title ?? "Saved to memory",
    recallHint: data?.recallHint ?? "",
    tags: Array.isArray(data?.tags) ? data.tags : [],
  }
}
