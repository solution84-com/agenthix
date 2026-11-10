import type { ReactNode } from 'react'
import type { SiteFileRef } from '@agenthix/core'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { PlaceRef } from '../../dock/startPlace'
import type { WorkspaceBranchesView } from '../../branches/views'
import { FolderTree } from '../../storage/pages/FolderTree'
import { OpenedFile } from '../../storage/pages/OpenedFile'
import { useLivePreview } from '../hooks/useLivePreview'
import { useFeature } from '../../features/useFeature'
import { useWorkspaceViewModel } from '../hooks/useWorkspaceViewModel'
import { useOpeningFile } from '../hooks/useOpeningFile'
import { useViewSize } from '../hooks/useViewSize'
import { workspaceViewPath, type ViewSection } from '../viewAddress'
import { agentOf } from '../words'
import { DiffMiddle } from './DiffMiddle'
import { FilesSide } from './FilesSide'
import { LeftPanel } from './LeftPanel'
import { GitFileMiddle, type ViewWorkspace } from './GitFileMiddle'
import { LivePreviewMiddle } from './LivePreviewMiddle'
import { WorkspaceFrame } from './WorkspaceFrame'
import { useViewTop } from './ViewTop'
import type { SwitcherItem } from './TopBar'

/**
 * The full-screen workspace view's parts: the top bar's breadcrumb and next step (`useViewTop`), *Live preview*, the
 * one file tree for the branch or the older version of `main` in view with its changes marked (board *Files and
 * changes, one view*), and the middle (the live preview, or a file opened whole with its changes in place).
 * `WorkspaceFrame` lays them out for the window's width; the chat is the app's panel beside it. The view always opens on a file, except on a phone, where the tree comes first. While the
 * live preview's flag is off there is no *Live preview*: an address naming it opens Files.
 */
export function WorkspaceViewBody({ workspace, view, userId, back, place, workspaces, refetchBranches }: {
  workspace: ViewWorkspace
  view: WorkspaceBranchesView
  userId: string | null
  back: { href: string; label: string }
  /** The place a new conversation about this workspace's work starts in. */
  place: PlaceRef
  workspaces: readonly SwitcherItem[]
  refetchBranches: () => void
}) {
  const m = useWorkspaceViewModel(workspace.id, userId, view)
  const { canAct } = view
  const size = useViewSize()
  const files = m.changes?.files ?? []
  const target = { ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id }
  const livePreviewOn = useFeature('livePreview')
  const section = m.state.section === 'preview' && livePreviewOn ? 'preview' : 'files'
  const previewChosen = m.git && section === 'preview'
  const preview = useLivePreview(workspace.id, m.line?.id ?? null, { enabled: m.git && livePreviewOn, shown: previewChosen })

  const older = m.version.at && !m.version.at.latest ? m.version.at : null
  // The changes marked: the branch's, or an older version's own against the version before it.
  const marks = m.line ? files : older ? m.versionChanges?.files ?? [] : []
  const where = m.line ? 'on this branch' : older ? `in v${older.number}` : ''
  const versionShown = older && m.version.named ? { number: older.number, named: m.version.named } : null
  const opening = useOpeningFile({
    workspaceId: workspace.id, gitRef: m.git && !m.version.pending ? m.gitRef : null,
    changes: m.line ? m.changes?.files : older ? (m.versionChangesLoading ? undefined : marks) : [], target, wanted: !m.selected && size !== 'phone' && !m.version.pending && (!m.git || !m.version.error),
  })
  const shown = m.selected ?? opening

  const settingsHref = `${back.href}&workspace=${encodeURIComponent(workspace.id)}&wabout=1`
  const top = useViewTop({ m, workspace, place, canAct, me: userId, settingsHref, livePreviews: livePreviewOn, refetchBranches })
  const onSection = (next: ViewSection) => m.set(next === 'preview' ? { section: next, file: null, diff: null } : { section: next })

  const filesBody = m.version.pending ? <FilesQuietLine>Loading…</FilesQuietLine>
    : m.version.error ? <FilesQuietLine role="status">{m.version.error.message}</FilesQuietLine>
    : (
      <FilesSide key={JSON.stringify(m.gitRef)} workspaceId={workspace.id} gitRef={m.git ? m.gitRef : null} changes={marks}
        onlyChanged={m.onlyChanged} onOnlyChanged={m.setOnlyChanged} onlyLabel={older ? `Only changed in v${older.number}` : 'Only changed'}
        selected={shown} onOpenFile={m.openFile}
        plainTree={<FolderTree target={target} selected={shown} onOpenFile={m.openFile} />} />
    )

  // A file a README names, by a link or an image, opens here in the view, its row chosen in the tree (S19).
  const openHere = (ref: SiteFileRef) => {
    if (ref.space === 'place' && ref.loc.workspaceId === workspace.id && !ref.loc.taskId) m.openFile(ref.path)
  }

  const middle = (layout: 'wide' | 'narrow'): ReactNode => {
    if (m.version.pending) return <FilesQuietLine>Loading…</FilesQuietLine>
    if (m.version.error) return <FilesQuietLine role="status">{m.version.error.message}</FilesQuietLine>
    if (m.line && !m.changes && m.changesError) return <FilesQuietLine role="status">{m.changesError.message}</FilesQuietLine>
    if (!shown) return <FilesQuietLine>{m.line && !m.changes ? 'Loading…' : 'No files yet.'}</FilesQuietLine>
    const change = marks.find(f => f.path === shown)
    if (change && m.line) {
      return <DiffMiddle workspaceId={workspace.id} gitRef={m.gitRef} change={change} where={where} layout={layout} onBack={m.closeMiddle} />
    }
    if (change && older && m.versionChanges) {
      return <DiffMiddle workspaceId={workspace.id} gitRef={m.gitRef} baseRef={{ kind: 'main', version: m.versionChanges.base }}
        change={change} where={where} layout={layout} onBack={m.closeMiddle} />
    }
    if (m.git) {
      // The commit in view: the branch's tip as its changes were read, the older version's, or main's tip.
      const commit = m.line ? m.changes?.head ?? null : older ? older.commit : m.mainLine?.head ?? null
      return <GitFileMiddle workspace={workspace} branchName={m.branchName} path={shown} commit={commit} layout={layout} onBack={m.closeMiddle} version={versionShown} onOpenFile={openHere} />
    }
    return (
      <OpenedFile file={{ space: 'place', loc: { ...target, taskId: null }, path: shown }} kind="files" path={shown}
        breadcrumb={[workspace.name, ...shown.split('/').slice(0, -1)]}
        back={layout === 'narrow' ? { label: shown.split('/').slice(0, -1).pop() ?? workspace.name, onBack: m.closeMiddle } : undefined}
        link={{ section: 'files', file: shown }} linkBase={workspaceViewPath(workspace.id)} onOpenFile={openHere} />
    )
  }

  const left = (
    // Without Git the panel is the files alone: an empty fragment stands where *Live preview* would be.
    <LeftPanel branchSelect={null} section={section} onSection={onSection} files={filesBody}
      noGit={m.git ? undefined : <></>} preview={livePreviewOn} previewState={preview.view?.state ?? 'stopped'} />
  )

  return (
    <WorkspaceFrame
      back={back} workspaceName={workspace.name} workspaces={workspaces}
      section={section} onSection={onSection} left={left} filesBody={filesBody} git={m.git}
      middle={middle} middleShown={!!m.selected}
      preview={livePreviewOn ? layout => (
        <LivePreviewMiddle workspaceId={workspace.id} branchId={m.line?.id ?? null} branchName={m.branchName} model={preview} canAct={canAct} layout={layout} />
      ) : undefined}
      previewState={preview.view?.state ?? 'stopped'}
      working={m.line?.working ? agentOf(m.line) ?? m.line.working.agentName : null}
      top={top} notice={m.notice} onDismissNotice={m.dismissNotice}
    />
  )
}
