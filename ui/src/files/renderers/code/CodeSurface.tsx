import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { SCROLL_MORE_FADE } from '../../../primitives/controlStyles'
import { TextLines } from '../text/TextLines'
import { ToggleButton } from '../ViewControls'
import { useMoreToRight } from '../useMoreToRight'
import { SyntaxHighlighter, grammarFor } from './codeLanguages'

/** Past this many bytes the text is drawn plain: highlighting a large file would stall the page. */
export const HIGHLIGHT_LIMIT = 512 * 1024
/** A line this long is drawn plain as well: highlighting one run that size stalls the page too. */
const LONG_LINE = 5000

const noPadding = { margin: 0, padding: 0, background: 'transparent', overflow: 'visible' } as const

interface HastNode {
  type: string
  value?: string | number
  properties?: { className?: string | string[]; [key: string]: unknown }
  children?: HastNode[]
}

const classesOf = (node: HastNode) => {
  const c = node.properties?.className
  return Array.isArray(c) ? c.join(' ') : c ?? ''
}

function tokens(nodes: HastNode[], trimEnd: boolean): ReactNode {
  return nodes.map((node, i) => {
    const last = trimEnd && i === nodes.length - 1
    if (node.type === 'text') return <Fragment key={i}>{last ? String(node.value ?? '').replace(/\n$/, '') : node.value}</Fragment>
    return <span key={i} className={classesOf(node) || undefined}>{tokens(node.children ?? [], last)}</span>
  })
}

/**
 * Each line is its number in a column of its own and the code as one run of text, its tokens inline spans, so a wrapped
 * line continues where it left off, hanging 2 characters in from its first character, and no token wraps on its own.
 */
function lineRows({ rows, wrap, marked }: { rows: HastNode[]; wrap: boolean; marked?: number }) {
  return (
    <div className={wrap ? '' : 'w-max min-w-full'}>
      {rows.map((row, i) => (
        <div key={i} className={`flex items-start ${i + 1 === marked ? 'bg-warning/15' : ''}`} data-problem={i + 1 === marked ? 'true' : undefined}>
          <span className="react-syntax-highlighter-line-number shrink-0">{i + 1}</span>
          <span className={`min-h-[1lh] min-w-0 flex-1 ${wrap ? 'whitespace-pre-wrap break-words pl-[2ch] indent-[-2ch]' : 'whitespace-pre'}`}>
            {tokens(row.children ?? [], true)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Wrap is on from the start when the view is narrower than about 80 characters. */
function useNarrowView() {
  const ref = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;width:80ch;font:inherit'
      el.appendChild(probe)
      const eighty = probe.offsetWidth
      probe.remove()
      setNarrow(eighty > 0 && el.clientWidth > 0 && el.clientWidth < eighty)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, narrow }
}

/**
 * Text with line numbers: highlighted by `language`, with Wrap (on from the start in a narrow view), an edge fade while
 * more lies to the right, and one line marked as the problem line when `markLine` names it. Colours are spans of text,
 * never markup.
 */
export function CodeSurface({ text, language, markLine, wrapStart = false }: {
  text: string
  language: string | undefined
  markLine?: number
  /** Wrap starts on whatever the width. */
  wrapStart?: boolean
}) {
  const view = useNarrowView()
  const [chosen, setChosen] = useState<boolean | null>(null)
  const wrap = chosen ?? (wrapStart || view.narrow)
  const scroller = useMoreToRight<HTMLDivElement>()
  const tooLong = text.length > HIGHLIGHT_LIMIT / 3 && new TextEncoder().encode(text).length > HIGHLIGHT_LIMIT
  const plain = tooLong || text.split('\n').some(line => line.length > LONG_LINE)
  const note = tooLong ? 'Highlighting is off for files over 512 KB.' : plain ? 'Highlighting is off for this file: it has a very long line.' : ''
  // The text without its final newline is what is drawn, so a problem past the last line marks the last one.
  const shown = text.replace(/\n$/, '')
  const marked = markLine === undefined ? undefined : Math.min(markLine, shown.split('\n').length)
  return (
    <div ref={view.ref}>
      <div className="mb-3 flex items-center justify-between gap-3 text-small text-text-secondary">
        <span>{note}</span>
        <ToggleButton pressed={wrap} onChange={setChosen}>Wrap</ToggleButton>
      </div>
      <div
        ref={scroller.ref} onScroll={scroller.onScroll}
        className={`overflow-x-auto font-mono text-small text-text-primary ${scroller.more ? SCROLL_MORE_FADE : ''}`}
      >
        {plain ? (
          <TextLines text={text} />
        ) : (
          <SyntaxHighlighter
            language={grammarFor(language)}
            useInlineStyles={false}
            wrapLines
            renderer={({ rows }: { rows: HastNode[] }) => lineRows({ rows, wrap, marked })}
            customStyle={noPadding}
            codeTagProps={{ style: { fontFamily: 'inherit' } }}
          >
            {shown}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  )
}
