import { useRef, useState } from 'react'
import { useAction, useQuery, deleteWorkspace, disconnectRepo, getWorkspace, getRepoState } from 'wasp/client/operations'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { FILES_BUTTON, FilesQuietLine, FilesViewHeader } from '@agenthix/ui/projects'
import { repoName } from './BackupLine'
import { FileOpened } from './FileOpened'
import { FolderTree } from './FolderTree'
import { RepoPanel } from './RepoPanel'
import { workspaceDeleteConfirm } from './workspaceDeleteWords'
import { WorkspaceAbout } from './WorkspaceAbout'
import { previewAddress, useFolder } from './filesToolData'
import { useToolParams, useWide } from './useToolParams'

/**
 * A workspace opened inside the Workspaces tool (spec §3): it opens as its file explorer. A box at the top says
 * what it is and offers a conversation in it and its preview; below, the folders beside the open file (wide) or
 * as a list (narrow). Its facts, runs and secrets are one step away in About. Only what hq knows is shown.
 */
export function WorkspaceView({ workspaceId, siteLabel, previewId, connecting, onBack }: {
  workspaceId: string
  siteLabel: string | null
  /** The workspace's running preview, if it has one. */
  previewId: string | null
  connecting: boolean
  onBack: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const wide = useWide(root)
  const url = useToolParams()
  const { data: ws, error } = useQuery(getWorkspace, { workspaceId })
  const remove = useAction(deleteWorkspace)
  const disconnect = useAction(disconnectRepo)
  const [notice, setNotice] = useState('')
  const owner = ws ? { ownerType: ws.ownerType as 'project' | 'user', ownerId: ws.ownerId } : null
  const target = owner && ws ? { ...owner, workspaceId: ws.id } : { ownerType: 'user' as const, ownerId: '', workspaceId }
  const { data: repoState } = useQuery(getRepoState, { target }, { enabled: !!ws })
  const top = useFolder(target, '', !!ws)
  const chosen = url.get('wfile')
  // Wide, the explorer opens on the README when there is one, as a repository's home page does.
  const readme = top.data?.find(e => !e.isDir && /^readme(\.md)?$/i.test(e.name))?.name ?? null
  const file = chosen ?? (wide ? readme : null)

  if (!ws || !owner) {
    return (
      <div ref={root}>
        <FilesViewHeader back="Workspaces" onBack={onBack} />
        {error ? <FilesQuietLine role="status">{error.message}</FilesQuietLine> : <FilesQuietLine>Loading…</FilesQuietLine>}
      </div>
    )
  }

  const act = (fn: () => Promise<unknown>) => async () => {
    setNotice('')
    try { await fn() } catch (e: unknown) { setNotice(e instanceof Error ? e.message : 'That did not work') }
  }
  const menu: OverflowItem[] = [
    { label: 'Delete workspace', danger: true, confirmLabel: workspaceDeleteConfirm(ws.repoUrl ?? null, typeof repoState?.hasFiles === 'boolean' ? repoState : null), onSelect: act(async () => { await remove({ workspaceId: ws.id }); onBack() }) },
  ]

  if (url.get('wabout')) {
    return (
      <div ref={root}>
        <WorkspaceAbout ws={ws} target={target} siteLabel={siteLabel} previewId={previewId} onDisconnect={act(() => disconnect({ target }))} onBack={() => url.set({ wabout: null })} />
      </div>
    )
  }

  const opened = file && (
    <FileOpened kind="files" target={target} path={file} backLabel={ws.name} onBack={() => url.set({ wfile: null })} embedded={wide} />
  )
  if (file && !wide) return <div ref={root}>{opened}</div>

  const header = (
    <FilesViewHeader
      back="Workspaces"
      onBack={onBack}
      title={ws.name}
      action={
        <span className="flex items-center gap-2">
          <button type="button" className="text-small text-accent hover:underline" onClick={() => url.set({ wabout: '1' })}>About</button>
          <OverflowMenu items={menu} />
        </span>
      }
    />
  )
  const box = (
    <div className="mx-4 mt-3 rounded-xl border border-border-subtle p-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-text-secondary">
        <span className="whitespace-nowrap font-mono">{ws.repoUrl ? repoName(ws.repoUrl) : 'No repository'}</span>
        {previewId && <span className="inline-flex items-center gap-1 whitespace-nowrap"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />Preview running</span>}
        {siteLabel && <span className="whitespace-nowrap text-text-muted">{siteLabel}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {previewId && <a href={previewAddress(previewId)} target="_blank" rel="noopener noreferrer" className={FILES_BUTTON}>Open preview</a>}
        {!ws.repoUrl && !connecting && <button type="button" className={FILES_BUTTON} onClick={() => url.set({ connect: '1' })}>Connect GitHub</button>}
      </div>
      {notice && <p role="alert" className="mt-2 text-small text-danger">{notice}</p>}
    </div>
  )
  const connect = connecting && <div className="px-4 pt-3"><RepoPanel target={target} repoName={ws.name} /></div>
  const tree = <FolderTree target={target} selected={file} onOpenFile={path => url.set({ wfile: path })} />

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {header}
      {box}
      {connect}
      {wide ? (
        <div className="mx-4 my-3 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-border-subtle py-2">{tree}</div>
          <section className="min-w-0 flex-1 overflow-y-auto">{opened || <FilesQuietLine>Select a file to read it.</FilesQuietLine>}</section>
        </div>
      ) : (
        <div className="pt-2">{tree}</div>
      )}
    </div>
  )
}
