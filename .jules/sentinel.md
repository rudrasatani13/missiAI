## 2026-04-20 - [Sentinel] OAuth state token entropy enhancement
**Vulnerability:** The OAuth connect routes for Google and Notion were using `crypto.randomUUID()` to generate state tokens for CSRF protection.
**Learning:** While `crypto.randomUUID()` (UUIDv4) uses a CSPRNG in modern environments, its primary purpose is generating unique identifiers, and it provides 122 bits of entropy. For security tokens like OAuth state parameters, it is best practice to use higher-entropy cryptographically secure random bytes directly, such as a 256-bit random hex string.
**Prevention:** Use `crypto.getRandomValues()` (or utility functions like `randomHex(32)` that wrap it) for generating security tokens, secrets, or CSRF protections instead of `crypto.randomUUID()`.
