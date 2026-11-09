import { useEffect, useMemo, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { failureOf } from '../../readFailure'
import { sizeLabel } from '../../../projects/fileListing'
import { CONTROL_HEIGHT, SCROLL_MORE_FADE } from '../../../primitives/controlStyles'
import { useMoreToRight } from '../useMoreToRight'
import { parseCsv } from './parseCsv'

/** The most read (spec part 6), and the most rows drawn. */
export const CSV_BYTE_LIMIT = 5 * 1024 * 1024
export const CSV_ROW_LIMIT = 10_000

type Direction = 'ascending' | 'descending'
type Sort = { column: number; direction: Direction } | null

const compareCells = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const CELL = 'border-b border-border-subtle px-3 py-1.5 text-left align-top'
/** A column whose text runs past this many characters wraps at it, and no narrower; every other cell keeps its width. */
const WRAP_AT = 40
const LONG_TEXT = `${CELL} w-[40ch] min-w-[40ch] max-w-[40ch] whitespace-normal break-words`
const SHORT = `${CELL} whitespace-nowrap`

function TableView({ facts, bytes, report, fact }: RendererProps) {
  const [data, setData] = useState<{ rows: string[][]; total: number } | null>(null)
  const [sort, setSort] = useState<Sort>(null)
  const [whole, setWhole] = useState(true)

  useEffect(() => {
    let live = true
    bytes.read(CSV_BYTE_LIMIT).then(({ bytes: read, whole }) => {
      if (!live) return
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(read, { stream: !whole })
      } catch {
        report({ state: 'failed', reason: 'unreadable' })
        return
      }
      // A cut file ends in the middle of a row, so the last row is not drawn.
      if (!whole) text = text.slice(0, Math.max(text.lastIndexOf('\n'), 0))
      const parsed = parseCsv(text, CSV_ROW_LIMIT + 1)
      setData(parsed)
      setWhole(whole)
      const total = Math.max(parsed.total - 1, 0)
      const rows = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'row' : 'rows'}`
      if (whole) fact(rows(total))
      if (whole && total <= CSV_ROW_LIMIT) {
        report({ state: 'ready' })
      } else {
        // Sorting only some of the rows would mislead, so a table shown in part says so and cannot be sorted.
        const shown = whole
          ? `the first ${CSV_ROW_LIMIT.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} rows`
          : `the first ${rows(Math.min(Math.max(parsed.total - 1, 0), CSV_ROW_LIMIT))} (${sizeLabel(read.length)} of ${sizeLabel(facts.size)})`
        report({ state: 'partial', shown: read.length, words: `Showing ${shown}. Download to see and sort all of it.` })
      }
    }, error => {
      const reason = failureOf(error)
      if (live && reason) report({ state: 'failed', reason })
    })
    return () => { live = false }
  }, [bytes, facts.size, report, fact])

  const scroller = useMoreToRight<HTMLDivElement>()
  const header = data?.rows[0] ?? []
  const body = useMemo(() => {
    if (!data) return []
    const rows = data.rows.slice(1, CSV_ROW_LIMIT + 1).map((cells, index) => ({ cells, number: index + 1 }))
    if (!sort || !whole) return rows
    const sign = sort.direction === 'ascending' ? 1 : -1
    return [...rows].sort((a, b) => sign * compareCells(a.cells[sort.column] ?? '', b.cells[sort.column] ?? ''))
  }, [data, sort, whole])

  if (!data) return null
  const columns = Math.max(header.length, ...body.map(r => r.cells.length))
  const cycle = (column: number) =>
    setSort(sort?.column !== column ? { column, direction: 'ascending' } : sort.direction === 'ascending' ? { column, direction: 'descending' } : null)
  const sortable = whole && data.total - 1 <= CSV_ROW_LIMIT
  const longText = Array.from({ length: columns }, (_, c) => body.slice(0, 500).some(r => (r.cells[c]?.length ?? 0) > WRAP_AT))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller.ref} onScroll={scroller.onScroll}
        className={`min-h-0 flex-1 overflow-auto rounded-md border border-border-subtle ${scroller.more ? SCROLL_MORE_FADE : ''}`}
      >
        <table className="w-max min-w-full border-collapse text-small text-text-primary">
          <thead>
            <tr>
              <th scope="col" className={`${CELL} sticky top-0 z-10 bg-surface-2 text-text-muted`} aria-label="Row" />
              {Array.from({ length: columns }, (_, c) => {
                const active = sort?.column === c ? sort.direction : null
                return (
                  <th key={c} scope="col" aria-sort={active ?? 'none'} className={`${SHORT} sticky top-0 z-10 bg-surface-2 font-medium`}>
                    {sortable ? (
                      <button type="button" onClick={() => cycle(c)} className={`flex items-center gap-1.5 whitespace-nowrap hover:text-accent-hover ${CONTROL_HEIGHT}`}>
                        {header[c] ?? ''}
                        <span aria-hidden className="text-text-muted">{active === 'ascending' ? '▲' : active === 'descending' ? '▼' : ''}</span>
                      </button>
                    ) : <span className="whitespace-nowrap">{header[c] ?? ''}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {body.map(({ cells, number }) => (
              <tr key={number} className="hover:bg-selected">
                <td className={`${SHORT} text-right tabular-nums text-text-muted`}>{number}</td>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c} className={longText[c] ? LONG_TEXT : SHORT}>{cells[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const tableRenderer: Renderer = {
  id: 'table',
  kinds: ['csv'],
  runs: 'page',
  previewLimit: CSV_BYTE_LIMIT,
  embeds: false,
  fills: true,
  render: props => <TableView {...props} />,
}
