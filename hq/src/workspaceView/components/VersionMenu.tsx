import { useEffect, useState } from 'react'
import { useQuery, getMainVersions } from 'wasp/client/operations'
import type { MainVersion } from '@agenthix/core'
import type { MainVersionsView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { versionLabel, whenText } from '../words'
import { Dropdown } from './Dropdown'
import { ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import type { BackgroundRead } from '@agenthix/ui/attention'
import { ReadFailed, ReadNudge, useSiteRead } from '../../shared/siteRead'

export type MainVersions = { versions: MainVersion[]; hasMore: boolean; more: () => void; loading: boolean; error: string | null; failure: unknown; retry: () => void; read: BackgroundRead }

/** main's versions, newest first, a page at a time; a new version on main starts the list again from the newest. */
export function useMainVersions(workspaceId: string, head: string, enabled = true): MainVersions {
  const [before, setBefore] = useState<string | null>(null)
  const [older, setOlder] = useState<MainVersion[]>([])
  const firstQuery = useQuery(getMainVersions, { workspaceId, before: null }, { enabled })
  const { data, error, refetch } = firstQuery
  const read = useSiteRead(firstQuery, { what: 'The versions' })
  const { data: page } = useQuery(getMainVersions, { workspaceId, before: before ?? '' }, { enabled: enabled && before !== null })
  useOnWorkspaceChange(refetch)
  const first = data as MainVersionsView | undefined
  const next = page as MainVersionsView | undefined
  useEffect(() => { if (next) setOlder(o => [...o, ...next.versions.filter(v => !o.some(x => x.commit === v.commit))]) }, [next])
  useEffect(() => { setBefore(null); setOlder([]) }, [head])
  const versions = [...(first?.versions ?? []), ...older]
  return {
    versions,
    hasMore: ((before === null ? first?.hasMore : next?.hasMore) ?? false) && versions.length > 0,
    more: () => { if (versions.length) setBefore(versions[versions.length - 1].commit) },
    loading: !first && !error,
    error: error ? error.message : null,
    // Data before error: with versions held, a failed refetch leaves them as they are.
    failure: !first && error ? error : null,
    retry: () => { void refetch() },
    read,
  }
}

/**
 * main's versions, newest first, each a merge with what it brought in. Choosing one names it in the address as
 * `v<number>`; choosing the newest goes back to the latest.
 */
export function VersionList({ list, chosen, count, onChoose }: {
  list: MainVersions
  /** The number of the older version in view; null for the latest. */
  chosen: number | null
  count: number
  onChoose: (version: string | null) => void
}) {
  return (
    <div data-testid="version-list">
      {list.failure ? <ReadFailed error={list.failure} what="The versions" retry={list.retry} /> : null}
      {!list.failure && <ReadNudge read={list.read} className="px-2 py-1" />}
      {list.loading && <p className="px-2 py-1 text-small text-text-muted">Loading…</p>}
      <ul aria-label="Versions of main" className="max-h-80 space-y-0.5 overflow-y-auto">
        {list.versions.map((v, i) => {
          const on = chosen !== null ? v.number === chosen : i === 0
          return (
            <li key={v.commit}>
              <button type="button" aria-current={on ? 'true' : undefined} onClick={() => onChoose(i === 0 ? null : `v${v.number}`)}
                className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 rounded-lg px-2 py-1.5 text-left text-small ${on ? ROW_CHOSEN : ROW_ITEM}`}>
                <span className="font-mono text-text-muted">v{v.number}</span>
                <span className="min-w-0">
                  <span className="block break-words text-text-primary">{v.subject}{i === 0 && <span className="text-micro text-success"> · latest</span>}</span>
                  <span className="block text-micro text-text-muted">{v.author.name} · {whenText(v.at)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {list.hasMore && (
        <button type="button" onClick={list.more} className="w-full rounded-lg px-2 py-1.5 text-left text-small ${ROW_ITEM}">
          All {count} versions…
        </button>
      )}
    </div>
  )
}

/** The breadcrumb's version ▾ on main: *v14 · latest*, or the older one in view, highlighted. */
export function VersionMenu({ list, chosen, latest, count, onChoose }: {
  list: MainVersions
  /** The number of the older version in view, null for the latest; `latest` false while it is still being read. */
  chosen: number | null
  latest: boolean
  count: number
  onChoose: (version: string | null) => void
}) {
  const label = versionLabel(latest ? count : chosen, latest)
  return (
    <Dropdown label={`Version: ${label}`} highlight={!latest} width="w-[24rem]"
      button={<span className="truncate font-medium">{label}</span>}>
      {close => <VersionList list={list} chosen={chosen} count={count} onChoose={v => { close(); onChoose(v) }} />}
    </Dropdown>
  )
}
