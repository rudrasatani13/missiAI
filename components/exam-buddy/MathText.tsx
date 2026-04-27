'use client'

import { useMemo } from 'react'
import katex from 'katex'
import DOMPurify from 'dompurify'

type RenderPart = string | { html: string }

/**
 * Renders text that may contain LaTeX math expressions.
 * Inline math: $...$ or \(...\)
 * Display math: $$...$$ or \[...\]
 *
 * P1-2 fix: KaTeX output is sanitized through DOMPurify before injection
 * via dangerouslySetInnerHTML. This is defense-in-depth against potential
 * future KaTeX CVEs or adversarial LaTeX payloads from AI output.
 */
export function MathText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const parts = useMemo(() => renderMathInText(text), [text])
  return (
    <span className={className} style={style}>
      {parts.map((part, index) =>
        typeof part === 'string'
          ? part
          : <span key={index} dangerouslySetInnerHTML={{ __html: part.html }} />,
      )}
    </span>
  )
}

/**
 * Sanitize KaTeX HTML output via DOMPurify.
 * Allows only the elements and attributes that KaTeX legitimately produces.
 */
function sanitizeKatexHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // KaTeX uses span, math, semantics, annotation, mrow, mi, mo, mn, mfrac,
    // msup, msub, msqrt, mover, munder, mtable, mtr, mtd, mtext, mspace, etc.
    // Allow all MathML elements plus the spans KaTeX wraps around them.
    USE_PROFILES: { mathMl: true, html: true },
    // Strip <script>, <iframe>, event handlers, etc. — DOMPurify defaults handle this.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
  })
}

function renderMathInText(input: string): RenderPart[] {
  if (!input) return ['']

  // Split on math delimiters: $$...$$, $...$, \[...\], \(...\)
  // Process display math first ($$), then inline ($)
  const parts: RenderPart[] = []
  const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\\)\$(?!\$)(?:[^$\\]|\\.)+?\$|\\\([\s\S]*?\\\)/g
  let lastIndex = 0

  for (const match of input.matchAll(pattern)) {
    const segment = match[0]
    const start = match.index ?? 0

    if (start > lastIndex) {
      parts.push(input.slice(lastIndex, start))
    }

    parts.push(renderMathSegment(segment))
    lastIndex = start + segment.length
  }

  if (lastIndex < input.length) {
    parts.push(input.slice(lastIndex))
  }

  return parts
}

function renderMathSegment(segment: string): RenderPart {
  let math = ''
  let displayMode = false

  // Display math: $$...$$ or \[...\]
  if (segment.startsWith('$$') && segment.endsWith('$$')) {
    math = segment.slice(2, -2)
    displayMode = true
  } else if (segment.startsWith('\\[') && segment.endsWith('\\]')) {
    math = segment.slice(2, -2)
    displayMode = true
  } else if (segment.startsWith('\\(') && segment.endsWith('\\)')) {
    // Inline math: $...$ or \(...\)
    // Negative lookbehind for \$ to avoid matching escaped dollar signs
    math = segment.slice(2, -2)
  } else {
    math = segment.slice(1, -1)
  }

  try {
    const rawHtml = katex.renderToString(math.trim(), { displayMode, throwOnError: false })
    // P1-2 fix: sanitize KaTeX HTML before injection
    return { html: sanitizeKatexHtml(rawHtml) }
  } catch {
    return segment
  }
}

