/**
 * STT audio upload validation helpers.
 *
 * Duration strategy:
 *   Server-side audio duration parsing is not feasible in the Cloudflare Workers
 *   edge runtime (no ffprobe, no native audio decoders). Voice quota is therefore
 *   deducted using a conservative size-based estimate that assumes 64 kbps CBR
 *   audio (8 000 bytes/second). This deliberately over-charges for high-bitrate
 *   uploads (protecting against quota under-deduction) and is capped at
 *   MAX_DURATION_MS to avoid runaway charges on large file uploads.
 *
 *   Limitation: the estimate may under-charge for very low-bitrate or heavily
 *   compressed audio, but the minimum floor of MIN_DURATION_MS prevents zero- or
 *   near-zero deductions from tiny valid recordings. WAV files are uncompressed
 *   and therefore occupy far more bytes per second than the 64 kbps baseline;
 *   their estimates are naturally larger and will hit the MAX_DURATION_MS cap
 *   sooner.
 *
 *   The client-supplied voiceDurationMs field is NEVER used as a quota input.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum deducted duration regardless of file size. */
export const STT_MIN_DURATION_MS = 3_000

/**
 * Maximum deducted duration. Caps quota charge for large uploads.
 * 10 MB at 64 kbps ≈ 1 250 s; capping at 120 s keeps charges bounded
 * even for uncompressed (WAV) recordings near the file-size limit.
 */
export const STT_MAX_DURATION_MS = 120_000

/** Assumed audio bitrate for duration estimation: 64 kbps = 8 000 bytes/second. */
const ASSUMED_BYTES_PER_SECOND = 8_000

/** Maximum accepted audio upload size (10 MB). */
export const STT_MAX_FILE_BYTES = 10_000_000

/**
 * Accepted MIME types for STT audio uploads.
 *
 * Notes:
 * - "audio/webm;codecs=opus" is normalised to "audio/webm" before lookup.
 * - "video/mp4" and "video/webm" are legitimate on Safari/iOS where the
 *   MediaRecorder API may produce a video container even for audio-only tracks.
 * - "application/octet-stream" and "" (empty) are browser fallbacks for
 *   unrecognised or missing content-type headers on some mobile devices.
 */
export const ALLOWED_STT_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'video/mp4',                // Safari/iOS audio in video container
  'video/webm',               // Some mobile browsers report this for audio
  'application/octet-stream', // Safari/iOS fallback for unrecognised types
  '',                         // Some legacy mobile browsers omit type entirely
])

// ─── Duration estimation ──────────────────────────────────────────────────────

/**
 * Derive a conservative voice-quota charge from the audio file's byte size.
 *
 * Assumes 64 kbps CBR audio (8 000 bytes/second), then clamps the result to
 * [STT_MIN_DURATION_MS, STT_MAX_DURATION_MS]. This estimate is always used
 * server-side; the client-supplied voiceDurationMs field is intentionally
 * ignored to prevent quota under-reporting.
 */
export function estimateAudioDurationMs(fileSizeBytes: number): number {
  const rawMs = (fileSizeBytes / ASSUMED_BYTES_PER_SECOND) * 1_000
  return Math.min(
    STT_MAX_DURATION_MS,
    Math.max(STT_MIN_DURATION_MS, Math.round(rawMs)),
  )
}

// ─── Magic-byte validators ────────────────────────────────────────────────────

function isWavBytes(b: Uint8Array): boolean {
  // RIFF....WAVE (12-byte header minimum)
  return (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45  // WAVE
  )
}

function isWebmBytes(b: Uint8Array): boolean {
  // EBML header — shared by all WebM (and Matroska) audio/video files
  return (
    b.length >= 4 &&
    b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3
  )
}

function isOggBytes(b: Uint8Array): boolean {
  // OggS capture pattern
  return (
    b.length >= 4 &&
    b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53
  )
}

function isMp3Bytes(b: Uint8Array): boolean {
  // ID3 tag header (ID3)
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true
  // MPEG frame sync: 0xFF FB | 0xFF F3 | 0xFF F2 | 0xFF FA
  return (
    b.length >= 2 &&
    b[0] === 0xFF &&
    (b[1] === 0xFB || b[1] === 0xF3 || b[1] === 0xF2 || b[1] === 0xFA)
  )
}

function isMp4Bytes(b: Uint8Array): boolean {
  // ISO Base Media File Format: ftyp box starts at byte offset 4
  return (
    b.length >= 8 &&
    b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
  )
}

function isFlacBytes(b: Uint8Array): boolean {
  // fLaC stream marker
  return (
    b.length >= 4 &&
    b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43
  )
}

/** Returns true if `b` matches any known audio file signature. */
function isAnyKnownAudio(b: Uint8Array): boolean {
  return (
    isWavBytes(b) ||
    isWebmBytes(b) ||
    isOggBytes(b) ||
    isMp3Bytes(b) ||
    isMp4Bytes(b) ||
    isFlacBytes(b)
  )
}

/**
 * Validate that the leading bytes of an audio upload match the declared MIME type.
 *
 * For opaque fallback types (`application/octet-stream`, empty string) the
 * declared MIME cannot be cross-checked against content, but the bytes must
 * still match at least one known audio signature so non-audio content is
 * always rejected.
 *
 * The `declaredMimeType` value should be the raw browser-supplied type; codec
 * parameters (e.g. ";codecs=opus") are stripped before comparison.
 *
 * Returns `true` when the file content is consistent with the declared type.
 */
export function validateAudioMagicBytes(
  bytes: Uint8Array,
  declaredMimeType: string,
): boolean {
  if (bytes.length < 4) return false
  // Strip codec/parameter suffix before lookup
  const normalizedMime = declaredMimeType.split(';')[0].trim().toLowerCase()

  switch (normalizedMime) {
    case 'audio/wav':
    case 'audio/x-wav':
      return isWavBytes(bytes)
    case 'audio/webm':
    case 'video/webm':
      return isWebmBytes(bytes)
    case 'audio/ogg':
      return isOggBytes(bytes)
    case 'audio/mpeg':
      return isMp3Bytes(bytes)
    case 'audio/mp4':
    case 'audio/aac':
    case 'video/mp4':
      return isMp4Bytes(bytes)
    case 'audio/flac':
      return isFlacBytes(bytes)
    case 'application/octet-stream':
    case '':
      // Cannot verify declared type vs magic bytes for opaque/missing types.
      // Accept only if the bytes match some known audio signature.
      return isAnyKnownAudio(bytes)
    default:
      return false
  }
}
