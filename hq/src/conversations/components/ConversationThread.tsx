import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from 'wasp/client/auth'
import { archiveConversation, getReplyVoice, setConversationKeep, useQuery } from 'wasp/client/operations'
import type { ConversationAgentView, ConversationMessageView } from '../../shared/conversations/protocol'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { splitShownParts, type ShownPart } from '../../shared/conversations/shownParts'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { useFloatingRoom } from '../hooks/useFloatingRoom'
import { spokenReveal } from '../voiceClient/reveal'
import { REVEAL } from '../../shared/components/reveal/pace'
import { useConversationThread } from '../hooks/useConversationThread'
import { useFailureControls } from '../hooks/useFailureControls'
import { workBar } from '../hooks/workBarState'
import { useSummariseNow } from '../hooks/useSummariseNow'
import { voiceLineOf } from '../voiceClient/voiceUi'
import { newConversationPath } from '../threadPaths'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'
import { closedRefusal } from './ClosedNotice'
import { AccessRefusal } from './AccessLine'
import { ConversationComposer } from './ConversationComposer'
import { ShownViewer } from './ShownViewer'
import { ConversationFilesContext, type ConversationFiles } from './conversationFiles'
import { useConversationOwner } from '../hooks/useConversationOwner'
import { useFileViewer } from '../../storage/pages/viewer/useFileViewer'
import { conversationFileTarget, conversationTaskFileTarget } from './conversationFiles'
import type { ReplyView } from './ReplyBody'
import { ThreadMessages } from './ThreadMessages'
import { WorkBar } from './WorkBar'
import { RequestsContext, mayAnswer, type RequestsView } from './approvals/requestsContext'
import { stripRequests, WaitingStrip } from './approvals/WaitingStrip'
import { useConversationWorkflowRuns } from '../hooks/useConversationWorkflowRuns'
import { isRunActive } from './WorkflowRunRow'
import { ConversationHeader } from './ConversationHeader'
import { ConversationHeaderTools } from './ConversationHeaderTools'
import { usePanelPlacement } from '../../dock/panelPlacement'
import { RenameConversationDialog } from './RenameConversationDialog'
import { LiveLine } from './LiveLine'
import { VoiceLine } from './VoiceLine'
import { ListenContext } from './ListenButton'
import { ConversationPlaces } from './ConversationPlaces'
import { DeleteConversationDialog } from './DeleteConversationDialog'
import type { WorkContext } from './WorkContext'
import { useAttention } from '../../shared/components/AttentionDialog'
import { saveToTask } from './SaveToTask'
import { UsedSkillOpenerContext, type UsedSkillRef } from '../../assets/conversation/usedSkillOpener'
import { UsedSkillPanel } from '../../assets/conversation/UsedSkillPanel'

/** What is going on in a conversation, for a view of it that shows only a sign (the dock's rail and pill). */
export interface ThreadActivity {
  /** Work or a reply under way. */
  working: boolean
  /** Requests waiting for the person's okay. */
  needYou: number
}

/**
 * One conversation: a header with the agent, the thread, and under it the message box — or, where the person
 * cannot write, the reason. Mount it keyed by the conversation's id. `listPath` is the place's list, where a new
 * conversation starts.
 */
export function ConversationThread({ conversationId, listPath, agentsById, onSeen, onActivity, onDeleted, onArchived }: {
  conversationId: string
  listPath: string
  /** A task's thread: the agents that may have answered in it, by id. */
  agentsById?: Record<string, ConversationAgentView>
  /** A task's thread: called with the newest message number the viewer has on screen. */
  onSeen?: (seq: number) => void
  /** Called with what is going on in it, and again whenever that changes. */
  onActivity?: (activity: ThreadActivity) => void
  /** Called once the person has deleted it, in place of going to `listPath`. */
  onDeleted?: () => void
  /** Called once the person has archived it, in place of going to `listPath`. */
  onArchived?: () => void
}) {
  const t = useConversationThread(conversationId)
  const workflowRuns = useConversationWorkflowRuns(conversationId)
  const newestSeq = t.messages.reduce((n, m) => Math.max(n, m.seq), 0)
  useEffect(() => { if (onSeen && newestSeq > 0) onSeen(newestSeq) }, [onSeen, newestSeq])
  const bar = workBar(t.activityRows)
  const working = bar.working > 0 || t.running
  useEffect(() => { onActivity?.({ working, needYou: bar.needYou }) }, [onActivity, working, bar.needYou])
  const view = t.view
  const { data: me } = useAuth()
  const root = useRef<HTMLDivElement>(null)
  const floating = useFloatingRoom()
  const canAct = !!view && view.canSpeak && view.status !== 'CLOSED'
  const myId = me?.id ?? null
  const { answerApproval } = t
  const requests = useMemo<RequestsView>(() => ({
    rows: t.activityRows, loaded: t.activityLoaded, canAct, busy: t.answering, myId, people: view?.people,
    onAnswer: (id, answer, note) => void answerApproval(id, answer, note),
  }), [t.activityRows, t.activityLoaded, canAct, t.answering, myId, view?.people, answerApproval])
  // A request's card may be in this thread twice over (the dock and the page): look only inside this one.
  const showRequest = useCallback((operationId: string) => {
    const cards = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-approval]') ?? [])
    cards.find((el) => el.dataset.approval === operationId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const summary = useSummariseNow(conversationId)
  const panel = usePanelPlacement()
  const [keepError, setKeepError] = useState<string | null>(null)
  const voiceCall = useVoiceCall()
  const [opened, setOpened] = useState<{ key: string; index: number } | null>(null)
  // A used skill opens where a shown part opens, in place of it. A chip's file opens in the file viewer, beside the chat.
  const [openedSkill, setOpenedSkill] = useState<UsedSkillRef | null>(null)
  const openSkill = useMemo(() => (ref: UsedSkillRef) => { setOpened(null); setOpenedSkill(ref) }, [])
  const { open: openInViewer } = useFileViewer()
  const failure = useFailureControls(t.messages, view, t.send, t.switchAccess)
  const owner = useConversationOwner(conversationId, view?.openedById)
  const saveAttention = useAttention()
  // The speaker under each answer shows only where text to speech works for the conversation's agent.
  const { data: replyVoice } = useQuery(getReplyVoice, { conversationId })
  const listen = useMemo(() => (replyVoice?.available ? { conversationId } : null), [replyVoice?.available, conversationId])
  const files = useMemo<ConversationFiles | null>(() => owner && {
    owner, placePath: listPath,
    onOpen: (ref) => { const t = conversationFileTarget(ref, listPath); if (t) openInViewer(t) },
    onOpenTaskFile: (file) => { const t = conversationTaskFileTarget(file); if (t) openInViewer(t) },
  }, [owner, listPath, openInViewer])
  const inVoice = voiceCall.voice.conversationId === conversationId && voiceCall.voice.phase !== 'off'
  // While voice speaks a reply, its text is laid out to the sentence being revealed and revealed a little ahead of the voice.
  const spoken = inVoice ? voiceCall.voice.reveal : null
  const reply = useMemo<ReplyView>(() => ({
    inVoice,
    limitFor: (turnId, text) => spokenReveal(spoken, turnId, text, REVEAL.leadMs / 1000)?.layout ?? null,
    targetFor: (turnId, text) => spokenReveal(spoken, turnId, text, REVEAL.leadMs / 1000)?.target ?? null,
    onOpenPart: (key, index) => { setOpenedSkill(null); setOpened({ key, index }) },
  }), [inVoice, spoken])

  if (t.viewError) {
    return <ReadFailure what="The conversation" retry={t.refetchView} />
  }
  if (!view || !t.loaded) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const agent = view.agent
  const openedPart = opened ? shownPartOf(opened, t.stream, t.messages) : null
  // In a call, the line above the box says what the agent is doing, always; out of one, only while it works.
  const voiceLine = inVoice ? voiceLineOf(voiceCall.voice, t.running || !!t.stream) : null
  const closed = view.status === 'CLOSED'
  const work: WorkContext = {
    conversationId,
    myId,
    newConversationHref: newConversationPath(listPath, agent?.id ?? null),
    placePath: listPath,
    people: view.people,
    canChangePlaces: !closed && myId !== null && view.openedById === myId,
    agentsById,
    saveToTask: view.taskId && view.canSpeak ? saveToTask(view.taskId, saveAttention.show) : undefined,
  }
  const tools = (
    <ConversationHeaderTools
      canDelete={myId !== null && view.openedById === myId}
      onDelete={() => setDeleting(true)}
      onArchive={view.status === 'ACTIVE' ? () => void archive() : undefined}
      canRename={view.canSpeak && !closed}
      onRename={() => setRenaming(true)}
      canSummarise={view.canSpeak && !closed}
      summarising={summary.summarising || t.running}
      onSummarise={() => void summary.summarise()}
      keep={view.keep}
      onToggleKeep={myId !== null && view.openedById === myId ? () => void toggleKeep() : undefined}
      runsHref={`/runs?conversation=${conversationId}`}
      panel={panel}
    />
  )
  const toggleKeep = async () => {
    setKeepError(null)
    try {
      await setConversationKeep({ conversationId, keep: !view.keep })
    } catch (err) {
      setKeepError(err instanceof Error ? err.message : 'That did not work. Try again.')
    }
  }
  const archive = async () => {
    setKeepError(null)
    try {
      await archiveConversation({ conversationId })
      if (onArchived) onArchived()
      else navigate(listPath)
    } catch (err) {
      setKeepError(err instanceof Error ? err.message : 'That did not work. Try again.')
    }
  }
  // What the running turn reports, for the line above the box: its steps, once it has taken one.
  const waiting = stripRequests(t.activityRows, (row) => mayAnswer(row, canAct))
  const liveSteps = t.steps && (!t.turnId || t.steps.turnId === t.turnId) ? t.steps : null
  return (
    <ConversationFilesContext.Provider value={files}>
    <ListenContext.Provider value={listen}>
    <UsedSkillOpenerContext.Provider value={openSkill}>
    <RequestsContext.Provider value={requests}>
    <div ref={root} className="flex h-full min-h-0">
    <div className="relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0">
        <ConversationHeader
          title={view.title || ''}
          avatar={agent && (
            <AgentProfileTrigger agentId={agent.id}>
              <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
            </AgentProfileTrigger>
          )}
          name={agent?.name}
          places={<ConversationPlaces conversationId={conversationId} agentName={agent?.name ?? 'The agent'} canChange={work.canChangePlaces === true} />}
          tools={tools}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <ThreadMessages
        floatingHeight={floating.height}
        floating={floating.element}
        messages={t.messages}
        waiting={t.waiting}
        stream={t.stream}
        running={t.running}
        turnId={t.turnId}
        turnSince={t.turnSince}
        steps={t.steps}
        agent={agent}
        hasMore={t.hasMore}
        loadingOlder={t.loadingOlder}
        onLoadOlder={() => void t.loadOlder()}
        busy={t.sending}
        onSendNow={(id) => void t.sendNow(id)}
        onCancel={(id) => void t.cancelWaiting(id)}
        work={work}
        reply={reply}
        onTryAgain={failure.onTryAgain}
        offer={failure.offer}
        listening={inVoice ? voiceCall.voice.partial : undefined}
        runs={workflowRuns.filter((r) => !isRunActive(r))}
        bar={<>
          {summary.summarising && (
            <div role="status" data-testid="summarising" className="mx-auto flex w-full max-w-[720px] items-center gap-2 px-4 py-1 text-small text-text-secondary">
              <Loader2 size={12} aria-hidden className="shrink-0 text-text-muted motion-safe:animate-spin" />
              Summarising…
            </div>
          )}
          <WorkBar
            rows={t.activityRows}
            liveLines={t.liveLines}
            workflowRuns={workflowRuns.filter(isRunActive)}
            actions={{
              canAct: view.canSpeak && !closed,
              busy: t.answering,
              onStop: (id) => void t.stopOperation(id),
            }}
          />
        </>}
      />

      {/* The box floats: the thread runs under it and fades out above it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10" data-testid="floating-box">
      <div aria-hidden className="absolute inset-x-0 -top-8 bottom-0 bg-gradient-to-t from-surface-1 from-70% to-transparent" />
      <div ref={floating.ref} className="pointer-events-auto relative mx-auto w-full max-w-[720px] [&_[data-testid=message-pill]]:shadow-pop">
        <ShowAttention kind="alert" text={summary.failure} title="The conversation was not summarised" onClose={summary.dismiss} />
        <ShowAttention kind="alert" text={keepError} onClose={() => setKeepError(null)} />
        <ShowAttention kind="alert" text={t.actionError} onClose={t.clearError} />
        {/* The strip, while a request waits, takes the live line's place: one line above the box. */}
        {!(view.canSpeak && !closed && waiting.length > 0) && (voiceLine ? (
          <VoiceLine
            state={voiceLine}
            agentName={agent?.name ?? 'The agent'}
            run={{ since: liveSteps?.since ?? t.turnSince, steps: liveSteps?.steps ?? [], writing: !!t.stream?.text }}
          />
        ) : (t.running || t.stream) && (
          <LiveLine
            agentName={agent?.name ?? 'The agent'}
            run={{ since: liveSteps?.since ?? t.turnSince, steps: liveSteps?.steps ?? [], writing: !!t.stream?.text }}
            quietWhileWriting
          />
        ))}
        {closed ? (
          <ConversationComposer
            conversationId={conversationId}
            view={view}
            running={false}
            sending={false}
            onSend={async () => false}
            onStop={t.stop}
            refusal={closedRefusal(view.status, view.closedReason, () => navigate(newConversationPath(listPath, agent?.id ?? null))) ?? undefined}
          />
        ) : view.canSpeak ? (
          <>
          <WaitingStrip
            requests={waiting}
            agentName={agent?.name ?? 'The agent'}
            onShow={showRequest}
          />
          {failure.accessLine && view.accessProblem ? (
            <AccessRefusal problem={view.accessProblem} offer={view.accessOffer} onSwitch={() => void t.switchAccess()}>
              {(refusal) => (
                <ConversationComposer
                  conversationId={conversationId}
                  view={view}
                  running={false}
                  sending={false}
                  onSend={async () => false}
                  onStop={t.stop}
                  refusal={refusal}
                />
              )}
            </AccessRefusal>
          ) : (
            <ConversationComposer
              conversationId={conversationId}
              view={view}
              running={t.running}
              sending={t.sending}
              onSend={t.send}
              onStop={t.stop}
            />
          )}
          </>
        ) : (
          <p className="px-4 pb-4 pt-2 text-small text-text-muted">You can read this conversation but not write in it.</p>
        )}
      </div>
      </div>
      </div>

      {renaming && <RenameConversationDialog conversationId={conversationId} title={view.title ?? ''} onClose={() => setRenaming(false)} />}

      {deleting && (
        <DeleteConversationDialog
          conversationId={conversationId}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); if (onDeleted) onDeleted(); else navigate(listPath) }}
          onArchive={async () => {
            await archiveConversation({ conversationId })
            if (onArchived) onArchived()
            else navigate(listPath)
          }}
        />
      )}
    </div>
    {openedPart && <ShownViewer part={openedPart} onClose={() => setOpened(null)} />}
    {openedSkill && <UsedSkillPanel conversationId={conversationId} skill={openedSkill} onClose={() => setOpenedSkill(null)} />}
    {saveAttention.dialog}
    </div>
    </RequestsContext.Provider>
    </UsedSkillOpenerContext.Provider>
    </ListenContext.Provider>
    </ConversationFilesContext.Provider>
  )
}

/** The part a card opened, read from the reply as it stands now: still streaming, or in the record. */
function shownPartOf(
  opened: { key: string; index: number },
  stream: { turnId: string; text: string } | null,
  messages: ConversationMessageView[],
): ShownPart | null {
  const record = messages.find((m) => m.turnId === opened.key || m.id === opened.key)
  const text = stream?.turnId === opened.key ? stream.text : record?.kind === 'TEXT' ? record.body.text : ''
  const parts = splitShownParts(text).flatMap((s) => (s.kind === 'shown' ? [s.part] : []))
  return parts[opened.index] ?? null
}
