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
 * @param input Raw user input
 * @returns Clean, safe string
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  let clean = stripHtml(input);
  clean = escapeSql(clean);
  return clean;
}
