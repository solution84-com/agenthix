import { useRef, useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useAction, useQuery, deleteWorkspace, disconnectRepo, getWorkspace, getRepoState, getWorkspaceRemoval } from 'wasp/client/operations'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { FILES_BUTTON, FilesQuietLine, FilesViewHeader } from '@agenthix/ui/projects'
import { repoName } from './BackupLine'
import { OpenedFile } from './OpenedFile'
import { FolderTree } from './FolderTree'
import { FolderBrowser } from './FolderBrowser'
import { GitLine } from './GitLine'
import { RepoPanel } from './RepoPanel'
import { withBranches, workspaceDeleteConfirm } from './workspaceDeleteWords'
import { WorkspaceAbout } from './WorkspaceAbout'
import { useFolder } from './filesToolData'
import { useToolParams, useWide } from './useToolParams'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

/**
 * A workspace opened inside the Workspaces tool (spec §3): it opens as its file explorer. A box at the top says
 * what it is and offers a conversation in it; below, the folders beside the open file (wide) or
 * as a list (narrow). Its facts, runs and secrets are one step away in About. Only what hq knows is shown.
 */
export function WorkspaceView({ workspaceId, siteLabel, connecting, onBack }: {
  workspaceId: string
  siteLabel: string | null
  connecting: boolean
  onBack: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const wide = useWide(root)
  const url = useToolParams()
  const wsQuery = useQuery(getWorkspace, { workspaceId })
  const ws = wsQuery.data
  const wsRead = useBackgroundRead(wsQuery, { what: 'The workspace' })
  const remove = useAction(deleteWorkspace)
  const disconnect = useAction(disconnectRepo)
  const [notice, setNotice] = useState('')
  const owner = ws ? { ownerType: ws.ownerType as 'project' | 'user', ownerId: ws.ownerId } : null
  const target = owner && ws ? { ...owner, workspaceId: ws.id } : { ownerType: 'user' as const, ownerId: '', workspaceId }
  const { data: repoState } = useQuery(getRepoState, { target }, { enabled: !!ws })
  // Connecting and disconnecting are a project administrator's; an answer without the flag leaves it to the server.
  const mayAdminister = repoState?.mayAdminister !== false
  // The branches a delete takes with it; a Viewer, who cannot delete, is refused this and sees none.
  const { data: removal } = useQuery(getWorkspaceRemoval, { workspaceId }, { enabled: !!ws, retry: false })
  const top = useFolder(target, '', !!ws)
  const chosen = url.get('wfile')
  // Wide, the explorer opens on the README when there is one, as a repository's home page does.
  const readme = top.data?.find(e => !e.isDir && /^readme(\.md)?$/i.test(e.name))?.name ?? null
  const file = chosen ?? (wide ? readme : null)

  // Not laid out yet: the open file's frame mounts once, in the layout it will stay in.
  if (wide === null) return <div ref={root} className="flex min-h-0 flex-1 flex-col" />

  if (!ws || !owner) {
    return (
      <div ref={root}>
        <FilesViewHeader back="Workspaces" onBack={onBack} />
        {wsRead.failedWithoutData ? wsRead.nudge : <FilesQuietLine>Loading…</FilesQuietLine>}
      </div>
    )
  }

  const act = (fn: () => Promise<unknown>) => async () => {
    setNotice('')
    try { await fn() } catch (e: unknown) { setNotice(pressFailureWords(e, 'That did not work')) }
  }
  const menu: OverflowItem[] = [
    { label: 'Delete workspace', danger: true, confirmLabel: withBranches(workspaceDeleteConfirm(ws.repoUrl ?? null, typeof repoState?.hasFiles === 'boolean' ? repoState : null), removal?.branches), onSelect: act(async () => { await remove({ workspaceId: ws.id }); onBack() }) },
  ]

  if (url.get('wabout')) {
    return (
      <div ref={root}>
        <WorkspaceAbout ws={ws} target={target} siteLabel={siteLabel} mayAdminister={mayAdminister} onDisconnect={act(() => disconnect({ target }))} onBack={() => url.set({ wabout: null })} />
      </div>
    )
  }

  const openFile = (path: string | null) => url.set({ wfile: path })
  const opened = (back: { label: string; onBack: () => void }, folderToggle?: { shown: boolean; onToggle: () => void }) => file && (
    <OpenedFile
      file={{ space: 'place', loc: { ...owner, workspaceId: ws.id, taskId: null }, path: file }}
      kind="files" path={file} breadcrumb={[ws.name, ...file.split('/').slice(0, -1)]}
      back={back} folderToggle={folderToggle}
      link={{ tool: url.get('tool'), workspace: ws.id, wfile: file }}
      onOpenFile={ref => { if (ref.space === 'place') openFile(ref.path) }}
    />
  )
  const browser = (
    <FolderBrowser
      target={target} top={ws.name} wide={wide} file={file} chosen={!!chosen}
      onOpenFile={openFile} onClose={() => openFile(null)}
      opened={({ back, folderToggle }) => opened(back, folderToggle)}
      narrowList={(search, found) => <div className="pt-2">{search}{found ?? <FolderTree target={target} selected={file} onOpenFile={openFile} />}</div>}
    />
  )
  if (file && !wide) return <div ref={root} className="flex min-h-0 flex-1 flex-col">{browser}</div>

  const header = (
    <FilesViewHeader
      back="Workspaces"
      onBack={onBack}
      title={ws.name}
      action={
        <span className="flex items-center gap-2">
          <button type="button" className={`rounded text-small text-link hover:underline ${FOCUS_RING}`} onClick={() => url.set({ wabout: '1' })}>About</button>
          <OverflowMenu items={menu} />
        </span>
      }
    />
  )
  const box = (
    <div className="mx-4 mt-3 rounded-xl border border-border-subtle p-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-text-secondary">
        <span className="whitespace-nowrap font-mono">{ws.repoUrl ? repoName(ws.repoUrl) : 'No repository'}</span>
        {siteLabel && <span className="whitespace-nowrap text-text-muted">{siteLabel}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!ws.repoUrl && !connecting && mayAdminister && <button type="button" className={FILES_BUTTON} onClick={() => url.set({ connect: '1' })}>Connect GitHub</button>}
      </div>
      {notice && <ShowAttention kind="alert" text={notice} />}
    </div>
  )
  const connect = connecting && mayAdminister && <div className="px-4 pt-3"><RepoPanel target={target} repoName={ws.name} /></div>
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {header}
      {wsRead.nudge && <div className="px-4 pt-2">{wsRead.nudge}</div>}
      {box}
      {connect}
      <GitLine target={target} className="mx-4 mt-3 rounded-xl border border-border-subtle" />
      {wide ? (
        <div className="mx-4 my-3 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle">{browser}</div>
      ) : browser}
    </div>
  )
}
