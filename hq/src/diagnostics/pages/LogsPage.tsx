import { useEffect, useMemo, useState } from 'react'
import { useQuery, getLogSources, getLogs, downloadLogs } from 'wasp/client/operations'
import type { LogLine } from '@agenthix/core'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { FleetAdminOnly } from './FleetAdminOnly'
import { LogLineRow } from './LogLineRow'
import { BUTTON } from './styles'
import { errorMessage, plural, saveFile } from './diagnosticsWords'

const FOLLOW_INTERVAL = 5_000
const HOUR = 60 * 60 * 1000
const RANGES = { '1h': HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR } as const
type Range = keyof typeof RANGES
const RANGE_LABEL: Record<Range, string> = { '1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days' }

const FIELD = 'rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-small text-text-primary'

type Levels = 'problems' | 'all'

/** Organisation › Infrastructure › Logs and diagnostics › Logs: one source at a time. */
export function LogsPage() {
  return (
    <OrgAdminPage
      area="infrastructure"
      title="Logs"
      trail={[{ label: 'Logs and diagnostics', href: '/org/infrastructure/diagnostics' }]}
      wide
    >
      <OrgAdminHeading title="Logs">Kept on each machine for 7 days. Tokens and secrets are removed before a line is written.</OrgAdminHeading>
      <FleetAdminOnly what="Logs"><LogsBody /></FleetAdminOnly>
    </OrgAdminPage>
  )
}

function LogsBody() {
  const { data: sources } = useQuery(getLogSources)
  const [chosen, setChosen] = useState<string | null>(null)
  const source = chosen ?? sources?.[0]?.source ?? null
  const current = sources?.find(s => s.source === source) ?? null

  return (
    <>
      <div role="group" aria-label="Source" className="mb-3 flex flex-wrap gap-2">
        {(sources ?? []).map(s => (
          <button
            key={s.source}
            type="button"
            aria-pressed={s.source === source}
            onClick={() => setChosen(s.source)}
            className={`cursor-pointer rounded-full border px-3 py-1 text-small ${s.source === source ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-text-secondary hover:bg-surface-2'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {!sources && <p className="text-body text-text-muted">Loading…</p>}
      {current?.notice && <p role="status" className="rounded-lg border border-border bg-surface-1 p-4 text-body text-text-secondary">{current.notice}</p>}
      {current && !current.notice && <SourceLines source={current.source} label={current.label} />}
    </>
  )
}

function SourceLines({ source, label }: { source: string; label: string }) {
  const [levels, setLevels] = useState<Levels>('problems')
  const [range, setRange] = useState<Range>('24h')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [follow, setFollow] = useState(false)
  const [older, setOlder] = useState<{ lines: LogLine[]; cursor: string | null } | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed), 300)
    return () => clearTimeout(t)
  }, [typed])

  // Fixed per choice, so the query keeps one key while it refetches.
  const since = useMemo(() => new Date(Date.now() - RANGES[range]).toISOString(), [range, source, levels, search])
  const filters = { source, levels, since, search: search || undefined }
  const { data: head, error } = useQuery(getLogs, filters, { refetchInterval: follow ? FOLLOW_INTERVAL : false })

  useEffect(() => { setOlder(null) }, [source, levels, range, search])

  const nextCursor = older ? older.cursor : head?.nextCursor ?? null
  const lines = [...(head?.lines ?? []), ...(older?.lines ?? [])]

  async function loadOlder() {
    if (!nextCursor) return
    setLoadingOlder(true)
    setNote(null)
    try {
      const page = await getLogs({ ...filters, cursor: nextCursor })
      setOlder({ lines: [...(older?.lines ?? []), ...page.lines], cursor: page.nextCursor })
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function download() {
    setNote(null)
    try {
      const file = await downloadLogs(filters)
      saveFile(file.fileName, file.text, 'text/plain')
      if (file.truncated) setNote(`Only the newest ${plural(file.lines, 'line')} are in the file.`)
    } catch (err) {
      setNote(errorMessage(err))
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Level" className={FIELD} value={levels} onChange={e => setLevels(e.target.value as Levels)}>
          <option value="problems">Errors and warnings</option>
          <option value="all">Everything</option>
        </select>
        <select aria-label="Time range" className={FIELD} value={range} onChange={e => setRange(e.target.value as Range)}>
          {(Object.keys(RANGES) as Range[]).map(r => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
        </select>
        <input
          type="search"
          aria-label="Search the logs"
          placeholder="Search the logs"
          className={`${FIELD} min-w-0 flex-1`}
          value={typed}
          onChange={e => setTyped(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-small text-text-secondary">
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />
          Follow new lines
        </label>
        <button type="button" className={BUTTON} onClick={download}>Download</button>
      </div>
      {note && <p role="alert" className="mb-3 text-small text-danger">{note}</p>}
      {error && <p role="alert" className="mb-3 text-small text-danger">The logs could not be read.</p>}
      {head && lines.length === 0 && <p className="text-body text-text-muted">No lines match.</p>}
      {lines.length > 0 && (
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {lines.map((line, i) => <LogLineRow key={`${line.at}-${i}`} line={line} />)}
        </ul>
      )}
      {!head && !error && <p className="text-body text-text-muted">Loading…</p>}
      {head && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-small text-text-muted">
          <span>{plural(lines.length, 'line')} · {levels === 'problems' ? 'Errors and warnings' : 'Everything'} · {label} · {RANGE_LABEL[range].toLowerCase()}</span>
          {nextCursor && (
            <button type="button" className={BUTTON} onClick={loadOlder} disabled={loadingOlder}>Older lines ›</button>
          )}
        </div>
      )}
    </>
  )
}
