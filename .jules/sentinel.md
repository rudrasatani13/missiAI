## 2024-XX-XX - XSS Vulnerability in MathText Component
**Vulnerability:** XSS vulnerability in `MathText` component due to use of `dangerouslySetInnerHTML` with unsanitized user input containing KaTeX rendered HTML mixed with the raw string.
**Learning:** React components that render Markdown, KaTeX, or any custom text-to-HTML formatting are prime targets for XSS if they use `dangerouslySetInnerHTML` without proper sanitization (e.g. using DOMPurify). The vulnerability was exacerbated because `text` passed to `MathText` might not have been fully sanitized prior to this component.
**Prevention:** Always use a sanitization library like DOMPurify when setting HTML using `dangerouslySetInnerHTML`.
