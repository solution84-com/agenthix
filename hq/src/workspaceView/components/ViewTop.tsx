import { useState, type ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import type { PlaceRef } from '../../dock/startPlace'
import type { WorkspaceViewModel } from '../hooks/useWorkspaceViewModel'
import { useBringUpToDate } from '../hooks/useBringUpToDate'
import { useBranchChat } from '../hooks/useBranchChat'
import { nextStepOf } from '../nextStep'
import { MAIN } from '../viewAddress'
import { blockedChat, canOpenBranchChat, updateWhy, versionLabel } from '../words'
import { BranchList, BranchMenu } from './BranchSelect'
import { MergeDialog } from './MergeDialog'
import { NextStepButtons, ReturnMainDialog, type NextStepActions } from './NextStep'
import { GitOnNote, TurnGitOnDialog, type GitTurnedOn } from './TurnGitOn'
import { VersionList, VersionMenu, useMainVersions } from './VersionMenu'
import { ViewAbout } from './ViewAbout'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

export interface ViewTopParts {
  /** The breadcrumb after the workspace: the branch ▾, then 💬 Chat on a branch or the version ▾ on main. */
  crumbs: ReactNode[]
  next: ReactNode
  /** The same next step, full width, for a phone's foot. */
  footNext: ReactNode
  onAbout: () => void
  /** The line under a phone's title, and which sheet it opens. */
  phoneLine: { text: string; readOnly: boolean; opens: 'branches' | 'versions' | null }
  branchList: (done: () => void) => ReactNode
  versionList: (done: () => void) => ReactNode
  /** Opens the branch's own chat; null on main, without Git, and on a branch whose chat the person cannot open. */
  openChat: (() => void) | null
  /** Set instead of `openChat` on someone else's conversation's branch: the disabled 💬 and why it is. */
  blockedChat: { label: string; why: string } | null
  /** Short lines under the top bar: Git turned on, a refusal of the last step. */
  note: ReactNode
  dialogs: ReactNode
}

/**
 * Everything the top bar does, for the frame to place: the branch and the version, 💬 Chat, the one next step and the
 * dialogs it opens (*Merge into main…*, *Return main to …*, *Keep versions with Git…*), and About.
 */
export function useViewTop({ m, workspace, place, canAct, me, settingsHref, livePreviews, refetchBranches }: {
  m: WorkspaceViewModel
  workspace: { id: string; name: string; ownerType: 'project' | 'user'; ownerId: string }
  place: PlaceRef
  canAct: boolean
  me: string | null
  settingsHref: string
  livePreviews: boolean
  refetchBranches: () => void
}): ViewTopParts {
  const [dialog, setDialog] = useState<'about' | 'git' | 'return' | null>(null)
  const [gitOn, setGitOn] = useState<GitTurnedOn | null>(null)
  const update = useBringUpToDate(m.line)
  const chat = useBranchChat(place)
  const main = m.mainLine
  const versions = useMainVersions(workspace.id, main?.head ?? '', !!main)
  // The older version of main in view, as HQ read the address's `v<number>`; null at the latest.
  const named = m.line ? null : m.version.named
  const older = named && m.version.at && !m.version.at.latest ? m.version.at : null
  const latest = !named || !!m.version.at?.latest
  const number = older ? older.number : named ? null : main?.versionCount ?? null
  const changes = m.changes ? m.changes.files.length : null
  const step = nextStepOf({ git: m.git, canAct, line: m.line, version: latest ? null : named, updating: update.updating, clashed: update.clashed })
  const chooseVersion = (v: string | null) => m.set({ version: v })

  const actions: NextStepActions = {
    onGit: () => setDialog('git'),
    onMerge: () => m.setMerging(true),
    onUpdate: () => void update.start(),
    onLatest: () => chooseVersion(null),
    onReturn: () => setDialog('return'),
    updateWhy: m.line ? updateWhy(m.line, update.clashed) : '',
    olderNumber: number,
  }
  const listProps = main && {
    main, branches: m.branches, chosen: m.line?.name ?? MAIN, onChoose: m.chooseBranch,
    onOrigin: (l: Parameters<typeof chat.open>[0]) => void chat.open(l), me, changes, livePreviews, canAct,
  }
  const mayChat = !!m.line && canOpenBranchChat(m.line.whose, me)
  const openChat = mayChat ? () => { if (m.line) void chat.open(m.line) } : null
  const blocked = m.line && !mayChat ? blockedChat(m.line.whose) : null

  const crumbs: ReactNode[] = []
  if (listProps && main) {
    crumbs.push(<BranchMenu key="branch" {...listProps} updating={update.updating} />)
    crumbs.push(m.line ? (
      blocked ? (
        <span key="chat" role="button" aria-disabled="true" title={blocked.why} aria-label={`${blocked.label}. ${blocked.why}`}
          className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-1.5 py-1 text-small text-text-muted">
          <MessageSquare size={14} aria-hidden /> {blocked.label}
        </span>
      ) : <ChatButton key="chat" onClick={openChat} />
    ) : (
      <VersionMenu key="version" list={versions} chosen={older?.number ?? null} latest={latest} count={main.versionCount} onChoose={chooseVersion} />
    ))
  }

  const phoneLine: ViewTopParts['phoneLine'] = !main
    ? { text: 'files only', readOnly: false, opens: null }
    : m.line
      ? { text: m.line.name, readOnly: false, opens: 'branches' }
      : { text: `${main.name} · ${versionLabel(number, latest).replace(' · ', ' ')}`, readOnly: !latest, opens: 'versions' }

  const problem = update.error ?? chat.error
  const note = (
    <>
      {gitOn && <GitOnNote result={gitOn} />}
      {problem && <ShowAttention kind="alert" text={problem} />}
    </>
  )

  const dialogs = (
    <>
      {dialog === 'about' && (
        <ViewAbout workspaceId={workspace.id} name={workspace.name} place={{ type: workspace.ownerType, id: workspace.ownerId }} git={m.git}
          main={main} line={m.line} me={me} changes={changes} settingsHref={settingsHref} onClose={() => setDialog(null)} />
      )}
      {dialog === 'git' && (
        <TurnGitOnDialog workspaceId={workspace.id} name={workspace.name} onClose={() => setDialog(null)}
          onDone={result => { setDialog(null); setGitOn(result); refetchBranches() }} />
      )}
      {dialog === 'return' && main && older && (
        <ReturnMainDialog workspaceId={workspace.id} version={older.commit} number={older.number} expectedMain={main.head} onClose={() => setDialog(null)}
          onDone={(_words, restored) => {
            setDialog(null)
            if (restored) chooseVersion(null)
            refetchBranches()
          }} />
      )}
      {m.merging && m.line && main && (
        <MergeDialog line={m.line} mainHead={main.head} mainVersion={main.versionCount} changes={m.changes?.files ?? []}
          summary={m.summary} onSummary={m.setSummary} onClose={() => m.setMerging(false)}
          onClash={() => { if (m.line) update.markClashed(m.line.id) }}
          onBringUpToDate={() => void update.start()}
          onMerged={result => {
            m.setMerging(false)
            if (result.branchClosed) m.chooseBranch(MAIN)
            refetchBranches()
          }} />
      )}
    </>
  )

  return {
    crumbs,
    next: step.kind === 'none' ? null : <NextStepButtons step={step} actions={actions} />,
    footNext: step.kind === 'none' ? null : <NextStepButtons step={step} actions={actions} wide />,
    onAbout: () => setDialog('about'),
    phoneLine,
    branchList: done => listProps && <BranchList {...listProps} onChoose={b => { done(); m.chooseBranch(b) }} onOrigin={l => { done(); void chat.open(l) }} />,
    versionList: done => main && (
      <VersionList list={versions} chosen={older?.number ?? null} count={main.versionCount} onChoose={v => { done(); chooseVersion(v) }} />
    ),
    openChat,
    blockedChat: blocked,
    note,
    dialogs,
  }
}

function ChatButton({ onClick }: { onClick: (() => void) | null }) {
  return (
    <button type="button" onClick={onClick ?? undefined} title="Open this branch's chat"
      className={`flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-small text-text-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}>
      <MessageSquare size={14} aria-hidden /> Chat
    </button>
  )
}
