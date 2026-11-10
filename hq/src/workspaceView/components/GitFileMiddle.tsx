import { useMemo } from 'react'
import { openFile } from 'wasp/client/operations'
import type { FileOpenAnswer, PlaceFileRef, SiteFileRef } from '@agenthix/core'
import { OpenedFile } from '../../storage/pages/OpenedFile'
import { workspaceViewPath } from '../viewAddress'

export interface ViewWorkspace {
  id: string
  name: string
  ownerType: 'project' | 'user'
  ownerId: string
}

/** Never settles: the file waits, its frame showing it loading, until the commit it is read at is known. */
const WAITING = () => new Promise<FileOpenAnswer>(() => {})

/**
 * A workspace file at one commit, as hq's *open* opens it: the ref names the file in the place and the commit of the
 * workspace's repository it is read at, so the site reads it from that commit, a relay carries its bytes, and its
 * ticket names that one version (adr-0153).
 */
export function gitFileRef(workspace: ViewWorkspace, path: string, commit: string): PlaceFileRef {
  return { space: 'place', loc: { ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id, taskId: null }, path, commit }
}

/**
 * A file of the chosen branch (or `main`) in the middle, in HQ's own file viewer (spec part 1, *Files*), read as every
 * other file is: hq opens it at the commit in view — the branch's tip, `main`'s, or the older version of `main` in
 * view, which says so and that it is read-only — and the frame draws it with the renderer for its kind, its states
 * and Download. A file that isn't at that commit says where it looked. Nothing here edits it.
 */
export function GitFileMiddle({ workspace, branchName, path, commit, layout, onBack, version = null, onOpenFile }: {
  workspace: ViewWorkspace
  branchName: string
  path: string
  /** The commit the file is read at; null while it is read. */
  commit: string | null
  layout: 'wide' | 'narrow'
  onBack: () => void
  /** The older version of `main` in view, by number and as the address names it; null at the tip. */
  version?: { number: number; named: string } | null
  /** Opens a file the shown one names, by a link or an image, in the view. */
  onOpenFile?: (ref: SiteFileRef) => void
}) {
  const place: PlaceFileRef = { space: 'place', loc: { ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id, taskId: null }, path }
  const ref = commit ? gitFileRef(workspace, path, commit) : null
  const refKey = ref ? JSON.stringify(ref) : `waiting:${workspace.id}:${path}`
  const source = useMemo(() => {
    const at = refKey.startsWith('waiting:') ? null : JSON.parse(refKey) as PlaceFileRef
    return { key: refKey, open: at ? async () => (await openFile({ file: at })) as FileOpenAnswer : WAITING }
  }, [refKey])
  const where = version ? `${branchName} at v${version.number}` : branchName
  const folders = path.split('/').slice(0, -1)
  const file = (
    <OpenedFile
      file={place} kind="files" path={path} breadcrumb={[workspace.name, ...folders]}
      back={layout === 'narrow' ? { label: folders[folders.length - 1] ?? workspace.name, onBack } : undefined} onOpenFile={onOpenFile}
      link={{ branch: branchName === 'main' ? null : branchName, section: 'files', file: path, version: version?.named ?? null }}
      linkBase={workspaceViewPath(workspace.id)}
      notThere={{ words: `It isn't on ${where}.` }}
      source={source}
    />
  )
  if (!version) return file
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p role="status" className="shrink-0 border-b border-border-subtle bg-surface-2 px-4 py-1.5 text-small text-text-secondary" data-testid="version-file">
        <b className="font-mono text-text-primary">{path}</b> as it was at v{version.number} · read-only
      </p>
      {file}
    </div>
  )
}
