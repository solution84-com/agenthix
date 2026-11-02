import type { ReactNode } from 'react'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { WorkspaceBranchesView } from '../../branches/views'
import { FolderTree } from '../../storage/pages/FolderTree'
import { OpenedFile } from '../../storage/pages/OpenedFile'
import { useWorkspaceViewModel } from '../hooks/useWorkspaceViewModel'
import { workspaceViewPath } from '../viewAddress'
import { aheadText, agentOf, mergedNotice, plural, whenText } from '../words'
import { BranchGitPanel } from './BranchGitPanel'
import { BranchSelect } from './BranchSelect'
import { ConversationPanel } from './ConversationPanel'
import { DiffMiddle } from './DiffMiddle'
import { FilesPanel } from './FilesPanel'
import { GitFileMiddle, type ViewWorkspace } from './GitFileMiddle'
import { MainGitPanel } from './MainGitPanel'
import { MergeDialog } from './MergeDialog'
import { TurnGitOn } from './TurnGitOn'
import { WorkspaceFrame } from './WorkspaceFrame'
import type { SwitcherItem } from './TopBar'

/**
 * The full-screen workspace view's parts (spec part 1): the branch select, Files and Git for the chosen branch, the
 * middle (a file, or a file's changes), and the conversation. `WorkspaceFrame` lays them out for the window's width.
 */
export function WorkspaceViewBody({ workspace, view, userId, back, workspaces, refetchBranches }: {
  workspace: ViewWorkspace
  view: WorkspaceBranchesView
  userId: string | null
  back: { href: string; label: string }
  workspaces: readonly SwitcherItem[]
  refetchBranches: () => void
}) {
  const m = useWorkspaceViewModel(workspace.id, userId, view)
  const { canAct } = view
  const files = m.changes?.files ?? []
  const change = m.state.diff ? files.find(f => f.path === m.state.diff) ?? null : null
  const target = { ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id }

  const select = (compact: boolean) => m.mainLine && (
    <BranchSelect main={m.mainLine} branches={m.branches} chosen={m.line?.name ?? 'main'} onChoose={m.chooseBranch} me={userId} compact={compact} />
  )

  const filesBody = m.git
    ? <FilesPanel workspaceId={workspace.id} gitRef={m.gitRef} changes={files} selected={m.state.file ?? m.state.diff}
        onOpenFile={m.openFile} onOpenChange={m.openChange} />
    : <FolderTree target={target} selected={m.state.file} onOpenFile={m.openFile} />

  const gitBody = !m.mainLine ? null : m.line ? (
    <BranchGitPanel workspaceId={workspace.id} me={userId} line={m.line} mainVersion={m.mainLine.versionCount}
      changes={m.changes?.files} changesError={m.changesError} overflow={m.changes?.overflow ?? false}
      selected={m.state.diff} canAct={canAct}
      onOpenChange={m.openChange} onMerge={() => m.setMerging(true)} />
  ) : (
    <MainGitPanel workspaceId={workspace.id} place={{ type: workspace.ownerType, id: workspace.ownerId }} main={m.mainLine} canAct={canAct} onChanged={refetchBranches} />
  )

  const middle = (layout: 'wide' | 'narrow'): ReactNode => {
    if (m.state.diff && m.line) {
      if (!change) return <FilesQuietLine role="status">{m.changes ? `${m.state.diff} has no changes on ${m.line.name}.` : 'Loading…'}</FilesQuietLine>
      return <DiffMiddle workspaceId={workspace.id} branchId={m.line.id} change={change} baseVersion={m.changes?.baseVersion ?? null}
        onOpenFile={change.status === 'deleted' ? undefined : () => m.openFile(change.path)} />
    }
    if (m.state.file && m.git) {
      return <GitFileMiddle workspace={workspace} gitRef={m.gitRef} branchName={m.branchName} path={m.state.file} layout={layout} onBack={m.closeMiddle} />
    }
    if (m.state.file) {
      return (
        <OpenedFile file={{ space: 'place', loc: { ...target, taskId: null }, path: m.state.file }} kind="files" path={m.state.file}
          breadcrumb={[workspace.name, ...m.state.file.split('/').slice(0, -1)]} backLabel={workspace.name} onBack={m.closeMiddle} layout={layout}
          link={{ section: 'files', file: m.state.file }} linkBase={workspaceViewPath(workspace.id)} />
      )
    }
    return <FilesQuietLine>{m.git ? 'Choose a file to read it, or a change to see what the branch did to it.' : 'Choose a file to read it.'}</FilesQuietLine>
  }

  const status = m.mainLine && (
    <div className="flex shrink-0 items-center gap-4 border-t border-border-subtle px-3 py-1 text-micro text-text-muted" data-testid="workspace-status">
      <span className="font-mono">{m.branchName}</span>
      {m.line ? <span>{aheadText(m.line.ahead, m.line.behind)} of main</span> : <span>{plural(m.mainLine.versionCount, 'version')}</span>}
      {m.line?.lastCommitAt && <span>Last commit {whenText(m.line.lastCommitAt)}</span>}
    </div>
  )

  const conversation = (
    <ConversationPanel workspaceId={workspace.id} workspaceName={workspace.name} git={m.git} line={m.line} listPath={back.href} canAct={canAct}
      pending={m.isMain ? m.pending : null} onStarted={m.setPending} onActivity={m.setActivity} />
  )

  const filesNote = m.line ? (files.length ? `${files.length} changed` : '') : ''
  const gitNote = m.line ? aheadText(m.line.ahead, m.line.behind) : m.mainLine ? plural(m.mainLine.versionCount, 'version') : ''
  const noGit = m.git ? undefined : <TurnGitOn workspaceId={workspace.id} name={workspace.name} canAct={canAct} onDone={refetchBranches} />

  return (
    <>
      <WorkspaceFrame
        back={back} aboutHref={`${back.href}&workspace=${encodeURIComponent(workspace.id)}&wabout=1`} workspaceName={workspace.name} workspaces={workspaces}
        section={m.state.section} onSection={section => m.set({ section })}
        select={select} filesBody={filesBody} gitBody={gitBody} filesNote={filesNote} gitNote={gitNote} noGit={noGit}
        middle={middle} middleShown={!!(m.state.file || m.state.diff)} status={status} conversation={conversation}
        branchTitle={m.branchName} activity={m.activity}
        agentName={m.line ? agentOf(m.line) : null}
        notice={m.notice} onDismissNotice={() => m.setNotice(null)}
      />
      {m.merging && m.line && m.mainLine && (
        <MergeDialog line={m.line} mainHead={m.mainLine.head} mainVersion={m.mainLine.versionCount} changes={files}
          summary={m.summary} onSummary={m.setSummary} onClose={() => m.setMerging(false)}
          onMerged={result => {
            m.setMerging(false)
            if (result.branchClosed) m.chooseBranch('main')
            m.setNotice(mergedNotice(result))
            refetchBranches()
          }} />
      )}
    </>
  )
}
