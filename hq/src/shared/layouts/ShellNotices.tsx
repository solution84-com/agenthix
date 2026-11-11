import { useEffect, useRef, useState } from 'react'
import { useAttention } from '@agenthix/ui/primitives'
import { useLocation } from 'react-router'
import { useQuery, getHqReadOnly, getScheduledChangeNotices } from 'wasp/client/operations'
import { bannerText, toldLine } from '../../sites/scheduled/noticeWords'
import { placeOf, readOnlyNotice } from './shellNoticeWords'

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

/** Never in a screen's layout: hq read-only for a move, and on a project's page or Home the scheduled changes that touch the person's work, each said once in the attention dialog. */
export function ShellNotices() {
  const { pathname } = useLocation()
  const { data: readOnly } = useQuery(getHqReadOnly, undefined, { refetchInterval: 30_000 })
  const { data: notices } = useQuery(getScheduledChangeNotices, undefined, { refetchInterval: 60_000 })
  const [dismissed, setDismissed] = useState(readDismissed)
  const { show, dialog } = useAttention()
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

  // One at a time, each once per visit to hq: the read-only notice first, then the scheduled changes. Closing a dialog
  // leaves the change to be seen again on the next visit; Dismiss puts it away on this device.
  const told = useRef(new Set<string>())
  const readOnlyKey = readOnly?.readOnly ? `read-only:${readOnly.since}` : null
  const next = readOnlyKey && !told.current.has(readOnlyKey) ? readOnlyKey : shown.find((n) => !told.current.has(n.key))?.key ?? null
  useEffect(() => {
    if (!next || told.current.has(next)) return
    told.current.add(next)
    if (readOnly?.readOnly && next === readOnlyKey) {
      const words = readOnlyNotice(readOnly.since, zone())
      show({ title: words.title, text: words.body })
      return
    }
    const n = shown.find((x) => x.key === next)
    if (!n) return
    const toldAt = new Date(n.told)
    const moved = n.moved ? new Date(n.moved) : null
    const text = bannerText({ kind: n.kind, siteName: n.siteName, at: new Date(n.at), expectedMinutes: n.expectedMinutes, detail: n.detail, told: toldAt, moved }, zone())
    show({
      title: text.title,
      text: <><p>{text.body}</p><p className="mt-2 text-small text-text-muted">{toldLine(toldAt, moved, new Date(), zone())}</p></>,
      actions: [{ label: 'Dismiss', onClick: () => putAway(n.key) }],
    })
  }, [next]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{dialog}</>
}
