import { useEffect, useMemo, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { failureOf } from '../../readFailure'
import { JsonTree, describeJson } from './JsonTree'
import { parseJson } from './jsonProblem'

/** The most read and drawn as a tree; the file's first 5 MB as text beyond it (spec part 6). */
export const JSON_LIMIT = 5 * 1024 * 1024

const TAB = 'rounded-md px-2.5 py-1 text-small'

function JsonView({ bytes, report, fact }: RendererProps) {
  const [text, setText] = useState<string | null>(null)
  const [whole, setWhole] = useState(true)
  const [view, setView] = useState<'tree' | 'text'>('tree')

  useEffect(() => {
    let live = true
    bytes.read(JSON_LIMIT).then(({ bytes: read, whole: all }) => {
      if (!live) return
      let decoded: string
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(read, { stream: !all })
      } catch {
        report({ state: 'failed', reason: 'unreadable' })
        return
      }
      setWhole(all)
      setText(decoded)
      report(all ? { state: 'ready' } : { state: 'partial', shown: read.length })
    }, error => {
      const reason = failureOf(error)
      if (live && reason) report({ state: 'failed', reason })
    })
    return () => { live = false }
  }, [bytes, report])

  // Only a whole file can be parsed; the first part of a larger one is drawn as text.
  const parsed = useMemo(() => (text !== null && whole ? parseJson(text) : null), [text, whole])

  useEffect(() => {
    if (parsed?.ok) fact(describeJson(parsed.value))
  }, [parsed, fact])

  if (text === null) return null
  const asText = <pre className="whitespace-pre-wrap break-words font-mono text-small text-text-primary">{text}</pre>
  if (!parsed?.ok) {
    return (
      <div>
        {parsed && (
          <p role="note" className="mb-3 text-small text-text-secondary">
            This isn't valid JSON: the problem is on line {parsed.problem.line.toLocaleString('en-GB')}, column {parsed.problem.column.toLocaleString('en-GB')}.
          </p>
        )}
        {asText}
      </div>
    )
  }
  return (
    <div>
      <div role="tablist" aria-label="View" className="mb-3 flex gap-1">
        {(['tree', 'text'] as const).map(v => (
          <button
            key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`${TAB} ${view === v ? 'bg-selected text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {v === 'tree' ? 'Tree' : 'Text'}
          </button>
        ))}
      </div>
      {view === 'tree' ? <JsonTree value={parsed.value} /> : asText}
    </div>
  )
}

export const jsonRenderer: Renderer = {
  id: 'json',
  kinds: ['json'],
  runs: 'page',
  previewLimit: JSON_LIMIT,
  embeds: false,
  render: props => <JsonView {...props} />,
}
