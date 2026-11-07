import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useQuery, getAssetDiff } from 'wasp/client/operations'
import { ChangeMarker, type ChangeStatus } from '@agenthix/ui/files'
import { FileTree, type TreeMark } from '../../../../shared/fileView/FileTree'
import { InPlaceChanges } from '../../../../shared/fileView/InPlaceChanges'
import { baseName } from '../../../../shared/fileView/pathTree'
import type { AssetDiffView, FileChangeView } from '../pageTypes'
import { SkillFileRead, useSkillFile } from './SkillFileRead'
import { fileDetails } from './fileDetails'
import { changedInWords } from './skillWords'

const SWITCH = 'rounded-lg border px-2.5 py-0.5 text-small'
const look = (on: boolean) => `${SWITCH} ${on ? 'border-accent bg-selected text-text-primary' : 'border-border text-text-secondary hover:text-text-primary'}`

/**
 * A skill's files at one version, filling the page (board *A skill's page*): the folder tree on the left and one file
 * open whole on the right, each scrolling in its own pane; SKILL.md first. An older version marks what it changed
 * against the version before it, in the tree (*Only changed* narrows it) and in place in a changed file. On a phone
 * the tree is the screen and a file opens on its own, with ‹ back to the tree.
 */
export function SkillFiles({ assetId, versionId, version, narrow, onShown }: {
  assetId: string
  /** An older version, read-only; null for the version in use. */
  versionId: string | null
  version: string
  narrow: boolean
  /** The file shown in the tree, or null: the header's ⋯ downloads it. */
  onShown?: (file: { path: string; bytes: Uint8Array } | null) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [source, setSource] = useState(false)
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [phoneFile, setPhoneFile] = useState(false)
  const { data: diffData } = useQuery(getAssetDiff, { assetId, versionId: versionId ?? '', against: 'previous' }, { enabled: versionId !== null })
  const diff = versionId ? (diffData as AssetDiffView | undefined) ?? null : null
  const changes = useMemo(() => new Map<string, FileChangeView>((diff?.files ?? []).map(f => [f.path, f])), [diff])
  const removedPath = selected && changes.get(selected)?.status === 'removed' ? selected : null
  const content = useSkillFile(assetId, versionId, removedPath ? null : selected)
  const open = removedPath ?? content.opened?.path ?? null
  const marks = useMemo(() => new Map<string, TreeMark>([...changes.values()].map(c => [c.path, { status: c.status as ChangeStatus }])), [changes])
  const all = useMemo(() => [...content.files.map(f => f.path), ...[...changes.values()].filter(c => c.status === 'removed').map(c => c.path)], [content.files, changes])
  const paths = onlyChanged ? all.filter(p => changes.has(p)) : all
  const change = open ? changes.get(open) ?? null : null
  const details = open && content.opened?.path === open ? fileDetails(open, content.opened.bytes) : ''
  const shown = open && content.opened?.path === open ? content.opened : null
  // Reported when the file shown changes, not on every render: the page keeps it for the ⋯ menu's downloads.
  useEffect(() => { onShown?.(shown) }, [shown?.path, shown?.bytes.length, onShown]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (path: string) => { setSelected(path); setSource(false); setPhoneFile(true) }

  const tree = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h2 className="flex-1 text-micro font-semibold uppercase tracking-wider text-text-muted">{versionId ? `Files at ${version}` : 'Files'}</h2>
        {versionId && (
          <label className="flex items-center gap-1.5 text-micro text-text-secondary">
            <input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} /> Only changed · {changes.size}
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="asset-tree">
        {content.error ? <p role="alert" className="px-3 text-small text-danger">{content.error}</p>
          : <FileTree paths={paths} marks={marks} selected={open} onOpen={choose} roomy={narrow} />}
      </div>
    </div>
  )

  const body = !open ? (
    <p className="p-4 text-small text-text-muted">{content.loading ? 'Loading…' : 'This version has no files to show.'}</p>
  ) : change ? (
    <InPlaceChanges before={change.before} after={change.after} binary={change.binary} wrap={narrow}
      heading={<>
        <span><ChangeMarker status={change.status} /></span>
        <b className="font-mono text-text-primary">{open}</b>
        <span>{changedInWords(change.status, version, diff?.from === null)}</span>
      </>} />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-body text-text-primary" title={details}>{open}</h2>
        {versionId && <span className="text-micro text-text-muted">read-only</span>}
        <span role="group" aria-label="Show" className="flex gap-1">
          <button type="button" aria-pressed={!source} className={look(!source)} onClick={() => setSource(false)}>Read</button>
          <button type="button" aria-pressed={source} className={look(source)} onClick={() => setSource(true)}>Source</button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="asset-files">
        {content.opened && content.opened.path === open
          ? <SkillFileRead key={`${versionId}:${open}`} path={open} bytes={content.opened.bytes} source={source} />
          : <p className="text-small text-text-muted">Loading…</p>}
      </div>
    </div>
  )

  if (narrow) {
    if (!phoneFile || !open) return <div className="flex min-h-0 flex-1 flex-col bg-surface-1">{tree}</div>
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-1.5">
          <button type="button" aria-label="Back to the files" onClick={() => setPhoneFile(false)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronLeft size={18} aria-hidden /></button>
          <p className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">{baseName(open)}</p>
        </div>
        {body}
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Files" className="flex w-[260px] shrink-0 flex-col border-r border-border-subtle bg-surface-1">{tree}</aside>
      <section aria-label="File" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1">{body}</section>
    </div>
  )
}
