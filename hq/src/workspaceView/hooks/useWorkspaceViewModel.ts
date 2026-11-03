import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, getBranchChanges } from 'wasp/client/operations'
import { useDock } from '../../dock/DockContext'
import type { BranchChangesView, BranchLineView, BranchRef, WorkspaceBranchesView } from '../../branches/views'
import type { ThreadActivity } from '../../conversations/components/ConversationThread'
import { MAIN } from '../viewAddress'
import { mergeSummary } from '../words'
import { useOnWorkspaceChange } from './useWorkspaceLive'
import { useViewState } from './useViewState'

const IDLE: ThreadActivity = { working: false, needYou: 0 }

/**
 * Everything the workspace view holds between its parts: where the person is (the address), the chosen branch and its
 * changes, the conversation started from `main` before it has a branch, the Merge dialog and its summary per branch,
 * and what the open thread reports of itself.
 *
 * A branch that closes (merged, or removed) leaves nothing behind: an address naming it moves to `main`, and the
 * dock's conversation is put away when it was that branch's. A merge's notice holds while `main` is at the version the
 * merge made, and goes once `main` moves on.
 */
export function useWorkspaceViewModel(workspaceId: string, userId: string | null, view: WorkspaceBranchesView) {
  const git = view.git
  const { state, set } = useViewState(workspaceId, userId, git ? 'git' : 'files')
  const branches: BranchLineView[] = view.git ? view.branches : []
  const line = branches.find(b => b.name === state.branch) ?? null
  const isMain = !line
  const gitRef: BranchRef = line ? { kind: 'branch', branchId: line.id } : { kind: 'main' }

  const changesQuery = useQuery(getBranchChanges, { workspaceId, branchId: line?.id ?? '' }, { enabled: !!line })
  // A disabled query's refetch still asks, so with main chosen a workspace event reads nothing.
  const refetchChanges = changesQuery.refetch
  const hasLine = !!line
  useOnWorkspaceChange(useCallback(() => { if (hasLine) void refetchChanges() }, [hasLine, refetchChanges]))
  const changes = line ? (changesQuery.data as BranchChangesView | undefined) : undefined

  // A conversation started from main shows until its first run makes its branch; then the view moves to that branch.
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    if (!pending) return
    const made = branches.find(b => b.whose.kind === 'conversation' && b.whose.conversationId === pending)
    if (made) { setPending(null); set({ branch: made.name, file: null, diff: null }) }
  }, [pending, branches, set])

  const [taskThread, setTaskThread] = useState<string | null>(null)
  useForgetClosedBranch(line, branches, taskThread)
  const known = !view.git || state.branch === MAIN || branches.some(b => b.name === state.branch)
  useEffect(() => { if (!known) set({ branch: MAIN, file: null, diff: null }) }, [known, set])

  // A task made here shows as waiting until its first run makes its branch; then the view moves to that branch.
  const [pendingTask, setPendingTask] = useState<{ id: string; title: string } | null>(null)
  useEffect(() => {
    if (!pendingTask) return
    const made = branches.find(b => b.whose.kind === 'task' && b.whose.taskId === pendingTask.id)
    if (made) { setPendingTask(null); set({ branch: made.name, file: null, diff: null }) }
  }, [pendingTask, branches, set])

  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [merging, setMerging] = useState(false)
  const [noticeAt, setNoticeAt] = useState<{ text: string; version: number } | null>(null)
  const mainVersion = view.git ? view.main.versionCount : 0
  const notice = noticeAt && mainVersion <= noticeAt.version ? noticeAt.text : null
  const showNotice = useCallback((text: string, version: number) => setNoticeAt({ text, version }), [])
  const dismissNotice = useCallback(() => setNoticeAt(null), [])
  useEffect(() => { setMerging(false) }, [line?.id])
  const summary = line ? summaries[line.id] ?? mergeSummary(line) : ''
  const setSummary = useCallback((text: string) => { if (line) setSummaries(s => ({ ...s, [line.id]: text })) }, [line])

  const [activity, setActivity] = useState<ThreadActivity>(IDLE)
  useEffect(() => { setActivity(IDLE) }, [line?.id, pending])

  const chooseBranch = useCallback((branch: string) => { setNoticeAt(null); set({ branch, file: null, diff: null }) }, [set])
  const openFile = useCallback((file: string) => set({ file, diff: null, section: state.section === 'git' ? 'git' : 'files' }), [set, state.section])
  const openChange = useCallback((diff: string) => set({ diff, file: null }), [set])
  const closeMiddle = useCallback(() => set({ file: null, diff: null }), [set])

  return {
    git, state, set, branches, line, isMain, gitRef,
    mainLine: view.git ? view.main : null,
    branchName: line?.name ?? (view.git ? view.main.name : MAIN),
    changes, changesError: line ? changesQuery.error ?? null : null,
    pending, setPending, pendingTask, setPendingTask,
    summary, setSummary, merging, setMerging, notice, showNotice, dismissNotice, setTaskThread,
    activity, setActivity,
    chooseBranch, openFile, openChange, closeMiddle,
  }
}

export type WorkspaceViewModel = ReturnType<typeof useWorkspaceViewModel>

/**
 * When the branch last shown closes, the dock no longer keeps its conversation (`?c=`): it was that branch's thread,
 * a conversation's own or its task's (`taskThread`, as the panel found it).
 */
function useForgetClosedBranch(line: BranchLineView | null, branches: readonly BranchLineView[], taskThread: string | null) {
  const dock = useDock()
  const last = useRef<{ name: string; conversationId: string | null } | null>(null)
  useEffect(() => {
    if (line) last.current = { name: line.name, conversationId: line.whose.kind === 'conversation' ? line.whose.conversationId : taskThread }
  }, [line, taskThread])
  useEffect(() => {
    const was = last.current
    if (!was || branches.some(b => b.name === was.name)) return
    last.current = null
    if (was.conversationId && dock?.open?.conversationId === was.conversationId) dock.close()
  }, [branches, dock])
}
