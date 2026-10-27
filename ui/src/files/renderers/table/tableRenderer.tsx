import { useEffect, useMemo, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { failureOf } from '../../readFailure'
import { parseCsv } from './parseCsv'

/** The most read (spec part 6), and the most rows drawn. */
export const CSV_BYTE_LIMIT = 5 * 1024 * 1024
export const CSV_ROW_LIMIT = 10_000

type Direction = 'ascending' | 'descending'
type Sort = { column: number; direction: Direction } | null

const compareCells = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const CELL = 'border-b border-border-subtle px-3 py-1.5 text-left align-top'

function TableView({ bytes, report, fact }: RendererProps) {
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
      if (whole) {
        const count = Math.max(parsed.total - 1, 0)
        fact(`${count.toLocaleString('en-GB')} ${count === 1 ? 'row' : 'rows'}`)
        report({ state: 'ready' })
      } else {
        report({ state: 'partial', shown: read.length })
      }
    }, error => {
      const reason = failureOf(error)
      if (live && reason) report({ state: 'failed', reason })
    })
    return () => { live = false }
  }, [bytes, report, fact])

  const header = data?.rows[0] ?? []
  const body = useMemo(() => {
    if (!data) return []
    const rows = data.rows.slice(1, CSV_ROW_LIMIT + 1).map((cells, index) => ({ cells, number: index + 1 }))
    if (!sort) return rows
    const sign = sort.direction === 'ascending' ? 1 : -1
    return [...rows].sort((a, b) => sign * compareCells(a.cells[sort.column] ?? '', b.cells[sort.column] ?? ''))
  }, [data, sort])

  if (!data) return null
  const columns = Math.max(header.length, ...body.map(r => r.cells.length))
  const cycle = (column: number) =>
    setSort(sort?.column !== column ? { column, direction: 'ascending' } : sort.direction === 'ascending' ? { column, direction: 'descending' } : null)
  const totalRows = Math.max(data.total - 1, 0)

  return (
    <div>
      {totalRows > CSV_ROW_LIMIT && (
        <p role="note" className="mb-3 text-small text-text-secondary">
          {whole
            ? `Showing ${CSV_ROW_LIMIT.toLocaleString('en-GB')} of ${totalRows.toLocaleString('en-GB')} rows`
            : `Showing the first ${CSV_ROW_LIMIT.toLocaleString('en-GB')} rows`}
        </p>
      )}
      <div className="max-h-[70vh] overflow-auto rounded-md border border-border-subtle">
        <table className="min-w-full border-collapse text-small text-text-primary">
          <thead>
            <tr>
              <th scope="col" className={`${CELL} sticky top-0 z-10 bg-surface-2 text-text-muted`} aria-label="Row" />
              {Array.from({ length: columns }, (_, c) => {
                const active = sort?.column === c ? sort.direction : null
                return (
                  <th key={c} scope="col" aria-sort={active ?? 'none'} className={`${CELL} sticky top-0 z-10 bg-surface-2 font-medium`}>
                    <button type="button" onClick={() => cycle(c)} className="flex items-center gap-1.5 whitespace-nowrap hover:text-accent-hover">
                      {header[c] ?? ''}
                      <span aria-hidden className="text-text-muted">{active === 'ascending' ? '▲' : active === 'descending' ? '▼' : ''}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {body.map(({ cells, number }) => (
              <tr key={number} className="hover:bg-selected">
                <td className={`${CELL} text-right tabular-nums text-text-muted`}>{number}</td>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c} className={`${CELL} max-w-[40ch] break-words`}>{cells[c] ?? ''}</td>
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
  render: props => <TableView {...props} />,
}
