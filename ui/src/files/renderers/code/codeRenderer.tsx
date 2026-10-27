import { useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { TEXT_LIMIT, useTextFile } from '../text/useTextFile'
import { SyntaxHighlighter, grammarFor } from './codeLanguages'

/** Past this many bytes the file is drawn plain: highlighting a large file would stall the page. */
export const HIGHLIGHT_LIMIT = 512 * 1024

const noPadding = { margin: 0, padding: 0, background: 'transparent', overflow: 'visible' } as const

/** Source code: highlighted, with line numbers, and Wrap off by default. Colours are spans of text, never markup. */
export function CodeView(props: RendererProps) {
  const text = useTextFile(props)
  const [wrap, setWrap] = useState(false)
  if (text === null) return null
  const plain = new TextEncoder().encode(text).length > HIGHLIGHT_LIMIT
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 text-small text-text-secondary">
        <span>{plain ? 'Highlighting is off for files over 512 KB.' : ''}</span>
        <label className="flex shrink-0 items-center gap-1.5">
          <input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} />
          Wrap
        </label>
      </div>
      <div className="overflow-x-auto font-mono text-small text-text-primary">
        {plain ? (
          <pre className={wrap ? 'whitespace-pre-wrap break-words' : ''}>{text}</pre>
        ) : (
          <SyntaxHighlighter
            language={grammarFor(props.facts.language)}
            useInlineStyles={false}
            showLineNumbers
            wrapLongLines={wrap}
            customStyle={noPadding}
            codeTagProps={{ style: { fontFamily: 'inherit' } }}
          >
            {text.replace(/\n$/, '')}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  )
}

export const codeRenderer: Renderer = {
  id: 'code',
  kinds: ['code'],
  runs: 'page',
  previewLimit: TEXT_LIMIT,
  embeds: false,
  render: props => <CodeView {...props} />,
}
