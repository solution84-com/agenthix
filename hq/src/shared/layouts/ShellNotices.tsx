import { useState } from 'react'
import { useLocation } from 'react-router'
import { useQuery, getHqReadOnly, getScheduledChangeNotices } from 'wasp/client/operations'
import { bannerText, toldLine } from '../../sites/scheduled/noticeWords'
import { placeOf, readOnlyNotice } from './shellNoticeWords'

const BOX = 'mx-4 mt-3 lg:mx-8 rounded-lg border px-4 py-3 text-small leading-relaxed'
const DISMISSED = 'agenthix.dismissedScheduledChanges'

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// A person's put-away notices are theirs on this device only; without storage the notice just shows again.
function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED) ?? '[]')
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

function writeDismissed(keys: string[]): void {
  try { localStorage.setItem(DISMISSED, JSON.stringify(keys.slice(-50))) } catch { /* storage may be blocked */ }
}

/** Under the screen bar of every screen: hq read-only for a move, and on a project's page or Home the scheduled changes that touch the person's work. */
export function ShellNotices() {
  const { pathname } = useLocation()
  const { data: readOnly } = useQuery(getHqReadOnly, undefined, { refetchInterval: 30_000 })
  const { data: notices } = useQuery(getScheduledChangeNotices, undefined, { refetchInterval: 60_000 })
  const [dismissed, setDismissed] = useState(readDismissed)
  const place = placeOf(pathname)

  const shown = (notices ?? []).filter((n) => {
    if (dismissed.includes(n.key) || !place) return false
    return 'home' in place ? n.siteName === null : n.projectKeys.includes(place.project)
  })
  const putAway = (key: string) => {
    const next = [...dismissed, key]
    writeDismissed(next)
    setDismissed(next)
  }

  if (!readOnly?.readOnly && shown.length === 0) return null
  const now = new Date()
  return (
    <div>
      {readOnly?.readOnly && (
        <div role="status" className={`${BOX} border-warning/20 bg-warning/10 text-text-primary`}>
          <p className="font-medium">{readOnlyNotice(readOnly.since, zone()).title}</p>
          <p className="mt-0.5 text-text-secondary">{readOnlyNotice(readOnly.since, zone()).body}</p>
        </div>
      )}
      {shown.map((n) => {
        const told = new Date(n.told)
        const moved = n.moved ? new Date(n.moved) : null
        const text = bannerText({ kind: n.kind, siteName: n.siteName, at: new Date(n.at), expectedMinutes: n.expectedMinutes, detail: n.detail, told, moved }, zone())
        return (
          <div key={n.key} role="status" className={`${BOX} border-border bg-surface-2 text-text-primary`}>
            <p className="font-medium">{text.title}</p>
            <p className="mt-0.5 text-text-secondary">{text.body}</p>
            <p className="mt-1 text-micro text-text-muted">
              {toldLine(told, moved, now, zone())} ·{' '}
              <button type="button" onClick={() => putAway(n.key)} className="font-medium text-accent hover:text-accent-hover cursor-pointer">Dismiss</button>
            </p>
          </div>
        )
      })}
    </div>
  )
}
