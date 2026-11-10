import { useEffect, useMemo, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { failureOf } from '../../readFailure'
import { sizeLabel } from '../../../projects/fileListing'
import { CodeSurface } from '../code/CodeSurface'
import { TextLines } from '../text/TextLines'
import { TEXT_LIMIT } from '../text/useTextFile'
import { ViewTabs } from '../ViewControls'
import { JsonTree, describeJson } from './JsonTree'
import { parseJson } from './jsonProblem'
import { wholeRecords } from './jsonPartial'

/** The most read and drawn as a whole tree. Past it, only the first 1 MB is read, drawn as the records in it. */
export const JSON_LIMIT = 5 * 1024 * 1024

type Read = { text: string; whole: boolean; records: { value: unknown; count: number } | null }

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

function JsonView({ facts, bytes, report, fact }: RendererProps) {
  const [read, setRead] = useState<Read | null>(null)
  const [view, setView] = useState<'tree' | 'text'>('tree')

  useEffect(() => {
    let live = true
    const past = facts.size > JSON_LIMIT
    bytes.read(past ? TEXT_LIMIT : JSON_LIMIT).then(({ bytes: got, whole }) => {
      if (!live) return
      let decoded: string
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(got, { stream: !whole })
      } catch {
        report({ state: 'failed', reason: 'unreadable' })
        return
      }
      if (whole) {
        setRead({ text: decoded, whole, records: null })
        report({ state: 'ready' })
        return
      }
      // A cut file: the whole records at its start, drawn as a tree with each record folded to one line.
      let records: Read['records'] = null
      const cut = wholeRecords(decoded)
      if (cut) {
        const parsed = parseJson(cut.text)
        if (parsed.ok) records = { value: parsed.value, count: cut.records }
      }
      setRead({ text: decoded, whole, records })
      const of = `${sizeLabel(got.length)} of ${sizeLabel(facts.size)}`
      report({
        state: 'partial', shown: got.length,
        words: `Showing the first ${records ? `${count(records.count, 'record', 'records')} (${of})` : of}. Download to see all of it.`,
      })
    }, error => {
      const reason = failureOf(error)
      if (live && reason) report({ state: 'failed', reason })
    })
    return () => { live = false }
  }, [bytes, facts.size, report])

  // Only a whole file can be parsed as it is; the first part of a larger one is read for its records.
  const parsed = useMemo(() => (read?.whole ? parseJson(read.text) : null), [read])

  useEffect(() => {
    if (parsed?.ok) fact(describeJson(parsed.value))
  }, [parsed, fact])

  if (read === null) return null
  if (read.whole && parsed && !parsed.ok) {
    const drawn = read.text.replace(/\n$/, '').split('\n').length
    const atEnd = parsed.problem.line > drawn
    return (
      <div>
        <p role="note" className="mb-3 text-small text-text-secondary">
          {atEnd
            ? `This isn't valid JSON: the file ends before the JSON is complete (after line ${drawn.toLocaleString('en-GB')}).`
            : `This isn't valid JSON: the problem is on line ${parsed.problem.line.toLocaleString('en-GB')}, column ${parsed.problem.column.toLocaleString('en-GB')}.`}
        </p>
        <CodeSurface text={read.text} language="json" markLine={parsed.problem.line} />
      </div>
    )
  }
  const value = parsed?.ok ? parsed.value : read.records?.value
  if (value === undefined) return <TextLines text={read.text} />
  return (
    <div>
      <div className="mb-3">
        <ViewTabs label="View" value={view} onChange={setView} tabs={[{ value: 'tree', label: 'Tree' }, { value: 'text', label: 'Text' }]} />
      </div>
      {view === 'tree' ? <JsonTree value={value} /> : <TextLines text={read.text} />}
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
