/**
 * Sanitization Toolkit
 * 
 * Provides utilities to remove HTML/script tags and escape inputs
 * against DB injections.
 */

/**
 * Strips HTML tags and <script> contents from a given string.
 * @param input Raw input string
 * @returns Sanitized string
 */
export function stripHtml(input: string): string {
  if (!input) return input;
  
  // Remove <script>...</script> and <style>...</style> content completely
  let sanitized = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  
  // Remove all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  
  return sanitized.trim();
}

/**
 * Escapes characters that are commonly dangerous in databases (e.g. SQL).
 * Useful for ensuring strings are safely escaped if ever used in raw queries,
 * even though the system predominantly uses KV or object-based datasets natively.
 * 
 * @param input Raw string
 * @returns Safely escaped string
 */
export function escapeSql(input: string): string {
  if (!input) return input;
  
  return input
    .replace(/[\0\x08\x09\x1a\n\r"'\\]/g, (char) => {
      switch (char) {
        case "\0": return "\\0";
        case "\x08": return "\\b";
        case "\x09": return "\\t";
        case "\x1a": return "\\z";
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\"": return "\\\"";
        case "'": return "\\'";
        case "\\": return "\\\\";
        default: return char;
      }
    });
}

/**
 * Comprehensive sanitization pipeline
 * 1. Strips HTML
 * 2. Escapes special SQL chars
 * 3. Strips prompt injection patterns (SEC-007 fix)
 * @param input Raw user input
 * @returns Clean, safe string
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  let clean = stripHtml(input);
  clean = escapeSql(clean);
  clean = stripPromptInjection(clean);
  return clean;
}

// ─── Prompt Injection Sanitization (SEC-007 fix) ──────────────────────────────
//
// Strips common prompt injection patterns from user input.
// Applied to all user-facing text that enters the AI pipeline (voice transcripts,
// chat messages, custom prompts) via the sanitizeInput pipeline used by Zod schemas.
//
// This mirrors the sanitizeForPrompt() logic used throughout the app
// but is designed for the general chat/voice pipeline.

const PROMPT_INJECTION_PATTERNS = /ignore\s*(all\s*)?previous\s*(instructions|prompts)?|you are now|system\s*:|<\|.*?\|>|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>|forget\s*(all\s*)?(previous|prior|above)\s*(instructions|context)?|disregard\s*(all\s*)?(previous|prior|above)/gi;

/**
 * Strips known prompt injection patterns from input.
 * Does NOT reject the entire message — just removes the dangerous fragments
 * so legitimate voice transcriptions with partial overlap still work.
 *
 * SEC-001 fix: normalize unicode (NFKC) and strip zero-width characters before
 * pattern matching to prevent bypass via homoglyphs, zero-width joiners, or
 * bidirectional text tricks (e.g. "ign‌ore" with U+200C zero-width non-joiner).
 */
export function stripPromptInjection(input: string): string {
  if (!input) return input;
  // Normalize unicode to canonical composed form and remove zero-width / invisible chars
  const normalized = input
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, "");
  return normalized.replace(PROMPT_INJECTION_PATTERNS, '').trim();
}
