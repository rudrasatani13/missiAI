'use client'

import { useMemo } from 'react'
import katex from 'katex'
import sanitizeHtml from 'sanitize-html'

type RenderPart = string | { html: string }

/**
 * Renders text that may contain LaTeX math expressions.
 * Inline math: $...$ or \(...\)
 * Display math: $$...$$ or \[...\]
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
    const sanitizedHtml = sanitizeHtml(rawHtml, {
      allowedTags: ['span', 'div', 'math', 'semantics', 'mrow', 'mn', 'mi', 'mo', 'ms', 'mspace', 'msqrt', 'mroot', 'mfrac', 'mi', 'munderover', 'munder', 'mover', 'msubsup', 'msub', 'msup', 'mmultiscripts', 'mprescripts', 'none', 'mlabeledtr', 'mtr', 'mtd', 'mtable', 'mphantom', 'annotation', 'annotation-xml'],
      allowedAttributes: {
        '*': ['class', 'style', 'mathvariant', 'mathcolor', 'mathbackground', 'mathsize', 'xmlns', 'display', 'aria-hidden', 'href', 'mathsize', 'stretchy', 'fence', 'separator', 'lspace', 'rspace', 'minsize', 'maxsize', 'symmetric', 'largeop', 'movablelimits', 'accent', 'form', 'length', 'linethickness', 'numalign', 'denomalign', 'bevelled', 'actiontype', 'selection', 'open', 'close', 'separators', 'rowalign', 'columnalign', 'groupalign', 'alignmentscope', 'columnwidth', 'width', 'rowspacing', 'columnspacing', 'rowlines', 'columnlines', 'frame', 'framespacing', 'equalrows', 'equalcolumns', 'displaystyle', 'scriptlevel', 'scriptminsize', 'background', 'color', 'height', 'depth', 'voffset']
      },
    })
    return { html: sanitizedHtml }
  } catch {
    return segment
  }
}
