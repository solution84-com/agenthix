import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAuth } from 'wasp/client/auth'
import { archiveConversation, setConversationKeep } from 'wasp/client/operations'
import type { ConversationAgentView, ConversationMessageView } from '../../shared/conversations/protocol'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { splitShownParts, type ShownPart } from '../../shared/conversations/shownParts'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { useConversationThread } from '../hooks/useConversationThread'
import { workBar } from '../hooks/workBarState'
import { useSummariseNow } from '../hooks/useSummariseNow'
import { speakerOf, SPEAKER_GLOW } from '../voiceClient/voiceUi'
import { newConversationPath } from '../threadPaths'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { ClosedNotice } from './ClosedNotice'
import { ConversationComposer } from './ConversationComposer'
import { ShownViewer } from './ShownViewer'
import type { ReplyView } from './ReplyBody'
import { ThreadMessages } from './ThreadMessages'
import { WorkBar } from './WorkBar'
import { ConversationHeaderTools } from './ConversationHeaderTools'
import { DeleteConversationDialog } from './DeleteConversationDialog'
import type { WorkContext } from './WorkContext'

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
  const newestSeq = t.messages.reduce((n, m) => Math.max(n, m.seq), 0)
  useEffect(() => { if (onSeen && newestSeq > 0) onSeen(newestSeq) }, [onSeen, newestSeq])
  const bar = workBar(t.activityRows)
  const working = bar.working > 0 || t.running
  useEffect(() => { onActivity?.({ working, needYou: bar.needYou }) }, [onActivity, working, bar.needYou])
  const view = t.view
  const { data: me } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const summary = useSummariseNow(conversationId)
  const [keepError, setKeepError] = useState<string | null>(null)
  const voiceCall = useVoiceCall()
  const [opened, setOpened] = useState<{ key: string; index: number } | null>(null)
  const inVoice = voiceCall.voice.conversationId === conversationId && voiceCall.voice.phase !== 'off'
  const reply = useMemo<ReplyView>(() => ({
    inVoice,
    limitFor: inVoice ? voiceCall.revealLimit : () => null,
    onOpenPart: (key, index) => setOpened({ key, index }),
  }), [inVoice, voiceCall.revealLimit])

  if (t.viewError) {
    return <p role="alert" className="px-4 py-6 text-small text-danger">{t.viewError.message}</p>
  }
  if (!view || !t.loaded) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const agent = view.agent
  const openedPart = opened ? shownPartOf(opened, t.stream, t.messages) : null
  const speaker = inVoice ? speakerOf(voiceCall.voice) : 'none'
  const closed = view.status === 'CLOSED'
  const myId = me?.id ?? null
  const work: WorkContext = {
    conversationId,
    myId,
    newConversationHref: newConversationPath(listPath, agent?.id ?? null),
    placePath: listPath,
    people: view.people,
    agentsById,
  }
  const tools = (
    <ConversationHeaderTools
      canDelete={myId !== null && view.openedById === myId}
      onDelete={() => setDeleting(true)}
      canSummarise={view.canSpeak && !closed}
      summarising={summary.summarising || t.running}
      onSummarise={() => void summary.summarise()}
      keep={view.keep}
      onToggleKeep={myId !== null && view.openedById === myId ? () => void toggleKeep() : undefined}
      runsHref={`/runs?conversation=${conversationId}`}
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
  const phoneRow = (!closed && view.canSpeak) || (myId !== null && view.openedById === myId)
  return (
    <div className="flex h-full min-h-0">
    <div className="relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {inVoice && (
        <div
          aria-hidden
          data-testid="voice-glow"
          data-speaker={speaker}
          className={`pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-gradient-to-t to-transparent transition-colors duration-500 ${SPEAKER_GLOW[speaker]}`}
        />
      )}
      <div className="hidden shrink-0 border-b border-border-subtle lg:block">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-4 py-3" data-testid="conversation-header">
          {agent && (
            <AgentProfileTrigger agentId={agent.id}>
              <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
            </AgentProfileTrigger>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-body font-medium text-text-primary">{view.title || 'New conversation'}</h1>
            {agent && <p className="truncate text-small text-text-muted">{agent.name}</p>}
          </div>
          {tools}
        </div>
      </div>

      {phoneRow && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2 lg:hidden" data-testid="conversation-model-row">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {agent && <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" />}
            {agent && <span className="truncate text-small text-text-muted">{agent.name}</span>}
          </div>
          {tools}
        </div>
      )}

      <ThreadMessages
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
        listening={inVoice ? voiceCall.voice.partial : undefined}
        bar={<>
          {summary.summarising && (
            <div role="status" data-testid="summarising" className="mx-auto flex w-full max-w-[720px] items-center gap-2 px-4 py-1 text-small text-text-secondary">
              <Loader2 size={12} aria-hidden className="shrink-0 text-accent motion-safe:animate-spin" />
              Summarising…
            </div>
          )}
          <WorkBar
            rows={t.activityRows}
            liveLines={t.liveLines}
            actions={{
              canAct: view.canSpeak && !closed,
              busy: t.answering,
              onStop: (id) => void t.stopOperation(id),
              onAnswer: (id, answer, note) => void t.answerApproval(id, answer, note),
            }}
          />
        </>}
      />

      <div className="mx-auto w-full max-w-[720px] shrink-0">
        <RefusedAction reason={summary.failure} onDismiss={summary.dismiss} className="mx-4 mb-1" />
        <RefusedAction reason={keepError} onDismiss={() => setKeepError(null)} className="mx-4 mb-1" />
        <RefusedAction reason={t.actionError} onDismiss={t.clearError} className="mx-4 mb-1" />
        {!closed && view.accessProblem && (
          <div role="status" className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/30 px-3 py-2 text-small text-text-secondary">
            <AlertTriangle size={14} aria-hidden className="shrink-0 text-warning" />
            <span className="min-w-0 flex-1">{view.accessProblem}</span>
            {view.accessOffer && (
              <button type="button" onClick={() => void t.switchAccess()} className="font-medium text-accent hover:underline max-lg:min-h-10">
                Switch to {view.accessOffer.label}
              </button>
            )}
          </div>
        )}
        {closed ? (
          <ClosedNotice status={view.status} reason={view.closedReason} newConversationHref={newConversationPath(listPath, agent?.id ?? null)} />
        ) : view.canSpeak ? (
          <ConversationComposer
            conversationId={conversationId}
            view={view}
            running={t.running}
            sending={t.sending}
            onSend={t.send}
            onStop={t.stop}
          />
        ) : (
          <p className="px-4 pb-4 pt-2 text-small text-text-muted">You can read this conversation but not write in it.</p>
        )}
      </div>

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
    </div>
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
