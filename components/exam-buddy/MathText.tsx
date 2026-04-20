'use client'

import { useMemo } from 'react'
import katex from 'katex'
import DOMPurify from 'dompurify'

/**
 * Renders text that may contain LaTeX math expressions.
 * Inline math: $...$ or \(...\)
 * Display math: $$...$$ or \[...\]
 */
export function MathText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const html = useMemo(() => {
    const rawHtml = renderMathInText(text)
    return DOMPurify.sanitize(rawHtml)
  }, [text])
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}

function renderMathInText(input: string): string {
  if (!input) return ''

  // Split on math delimiters: $$...$$, $...$, \[...\], \(...\)
  // Process display math first ($$), then inline ($)
  let result = input

  // Display math: $$...$$ or \[...\]
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return `$$${math}$$`
    }
  })

  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return `\\[${math}\\]`
    }
  })

  // Inline math: $...$ or \(...\)
  // Negative lookbehind for \$ to avoid matching escaped dollar signs
  result = result.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return `$${math}$`
    }
  })

  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return `\\(${math}\\)`
    }
  })

  return result
}
