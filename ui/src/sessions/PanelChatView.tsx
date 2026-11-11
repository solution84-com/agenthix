/**
 * PanelChatView
 * =============
 * A conversation with an agent, in a project or in Chat: its record (what each
 * run did, approvals, failures, the agent's memory), the reply being written
 * and the message box.
 *
 * All data-fetching is injected via `queries` and `actions` props so this
 * component has zero Wasp/site dependencies.
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { AgentAvatar } from './SessionComponents'
import type { SessionDetail, PendingManifestData } from './types'
import type { PanelChatViewProps } from './panelChatViewTypes'
import { DEFAULT_AGENT_MODEL } from '../agents/types'
import { PanelChatHeader } from './PanelChatHeader'
import { PanelChatComposer } from './PanelChatComposer'
import { conversationRuntime } from './conversationRuntime'
import { useMentionTarget } from './mention'
import { useLiveRun } from './useLiveRun'
import { useConversationActions } from './useConversationActions'
import { conversationItems, modelName, type ReplyItem } from './conversationModel'
import { ConversationItems } from './ConversationItems'
import { ConversationUserMessage } from './ConversationMessages'
import { LiveReply } from './LiveReply'
import { ConversationPopup } from './ConversationPopup'
import type { WorkLineActions } from './WorkLineFold'
import { ReadFailure } from '../attention/ReadFailure'
import { Nudge } from '../attention/Nudge'
import { isFinal, retryRead } from '../attention/retry'
import type { ThreadLine } from './useConversationActions'

export type { PanelChatViewQueries, PanelChatViewActions, PanelChatViewProps } from './panelChatViewTypes'

// ── Component ─────────────────────────────────────────────────────────────────

export function PanelChatView({
  sessionId, socket, queries, actions, renderMarkdown, mode = 'panel', hideHeader, agentName: agentNameProp,
  onBack, onMaximizeToggle, onClose, agentStatsBar, sendDisabledReason, composerReplacement, placeholder,
  onOpenRun, onOpenTarget, canOpenTarget, skillLabel, onOpenConversationRuns, conversationPopup,
}: PanelChatViewProps) {
  const isConnected = socket?.connected ?? false

  const [sessionData, setSessionData] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // The first read's failure, after its retries; a final answer (not found, not allowed) is said in its own words.
  const [loadFailed, setLoadFailed] = useState<{ final: string | null } | null>(null)
  const [pendingManifestFromDb, setPendingManifestFromDb] = useState<PendingManifestData | null>(null)
  const [inputText, setInputText] = useState('')
  const [optimistic, setOptimistic] = useState<string | null>(null)
  // The conversation's own failures: a line after its last message, and "Not sent" over the message box.
  const [line, setLine] = useState<ThreadLine | null>(null)
  const [notSent, setNotSent] = useState<string | null>(null)
  // Try again on the first read: a new attempt reads it again.
  const [attempt, setAttempt] = useState(0)
  const [ownPopupOpen, setOwnPopupOpen] = useState(false)
  const popup = conversationPopup ?? { open: ownPopupOpen, onOpenChange: setOwnPopupOpen }

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // True until the person scrolls up to read history; asynchronous growth never yanks someone who has scrolled away.
  const stickToBottomRef = useRef(true)

  // The conversation on screen: an answer for any other one arrives too late and is dropped.
  const shownSessionRef = useRef(sessionId)
  shownSessionRef.current = sessionId

  const refetch = useCallback(() => queries.getSession({ id: sessionId }).then(data => {
    if (shownSessionRef.current === sessionId) setSessionData(data)
    return data
  }), [queries, sessionId])

  const live = useLiveRun({
    socket, sessionId, refetch,
    onRunEnded: (status, error, record) => {
      setOptimistic(null)
      // A site that does not record a failure in the conversation still has its reason said.
      if (status === 'FAILED' && error && !record.entries.some(e => e.kind === 'RUN_FAILED')) setLine({ words: `The reply failed: ${error}` })
    },
  })

  useEffect(() => {
    setInputText('')
    setOptimistic(null)
    setLine(null)
    setNotSent(null)
    // Another conversation's thread is never held while this one's first read is out or has failed.
    setSessionData(null)
    setPendingManifestFromDb(null)
  }, [sessionId])

  useEffect(() => {
    let current = true
    setIsLoading(true)
    setLoadFailed(null)
    stickToBottomRef.current = true
    Promise.all([
      retryRead(() => queries.getSession({ id: sessionId })).then(data => {
        if (!current) return
        setSessionData(data)
        // A reply already going when the view opens: follow it, and let Stop reach it.
        const going = data.entries.find(e => e.role === 'USER' && e.runStatus === 'RUNNING' && e.runId)
        if (going?.runId) live.track(going.runId)
      }),
      retryRead(() => queries.getSessionPendingManifest({ sessionId })).then(data => { if (current) setPendingManifestFromDb(data) }),
    ]).catch((e: unknown) => {
      if (current) setLoadFailed({ final: isFinal(e) ? (e as Error)?.message || 'This conversation is not there for you.' : null })
    })
      .finally(() => { if (current) setIsLoading(false) })
    return () => { current = false }
  }, [sessionId, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pendingManifestFromDb && !live.pendingManifest) live.setPendingManifest(pendingManifestFromDb)
  }, [pendingManifestFromDb])

  useMentionTarget(useCallback((text: string) => {
    setInputText(prev => (prev.trim() ? `${prev.trimEnd()} ${text} ` : `${text} `))
    textareaRef.current?.focus()
  }, []))

  const { handleSend, sendAgain, handleStop, handleTryAgain, handleSummarise, afterWaiting, changeModel, trying } = useConversationActions({
    sessionId, actions, live, refetch, inputText, setInputText, setOptimistic, setLine, setNotSent, textareaRef, stickToBottomRef, sendDisabledReason,
  })
  const threadLine = line && <Nudge place="thread" action={line.retry && { label: 'Try again', onClick: line.retry }}>{line.words}</Nudge>

  const agentName = agentNameProp ?? sessionData?.agent?.name ?? 'Agent'
  const avatarUrl = sessionData?.agent?.avatarUrl
  const currentModel = sessionData?.model ?? DEFAULT_AGENT_MODEL
  const items = useMemo(() => conversationItems(sessionData?.entries ?? []), [sessionData?.entries])
  const record = sessionData?.conversation
  const contextUse = record?.contextUse ?? null
  const showOptimistic = !!optimistic && !items.some(i => i.type === 'user' && i.entry.runStatus === 'RUNNING' && i.entry.content === optimistic)
  const hasMessages = items.length > 0 || live.isSending || !!optimistic

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  // Content height settles asynchronously (markdown, streaming, new messages): re-pin on every resize while anchored.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    const content = messagesContentRef.current
    if (!container || !content) return
    const pin = () => { if (stickToBottomRef.current) container.scrollTop = container.scrollHeight }
    pin()
    const r1 = requestAnimationFrame(pin)
    const r2 = requestAnimationFrame(() => requestAnimationFrame(pin))
    const ro = new ResizeObserver(pin)
    ro.observe(content)
    ro.observe(container)
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); ro.disconnect() }
  }, [sessionId, hasMessages, isLoading])

  const workActions: WorkLineActions = { onOpenRun, onOpenTarget: t => onOpenTarget?.(t), canOpenTarget: canOpenTarget ?? (() => false), skillLabel }
  const total = {
    inputTokens: sessionData?.totalInputTokens ?? 0,
    outputTokens: sessionData?.totalOutputTokens ?? 0,
    cacheReadTokens: sessionData?.totalCacheReadTokens ?? 0,
    cacheWriteTokens: sessionData?.totalCacheWriteTokens ?? 0,
    totalTokens: 0,
  }
  total.totalTokens = total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens
  const latestRunId = [...items].reverse().find((i): i is ReplyItem => i.type === 'reply' && !!i.runId)?.runId ?? null

  const liveBlock = (
    <>
      {showOptimistic && <ConversationUserMessage content={optimistic!} />}
      {(live.isSending || live.streamed) && (
        <LiveReply
          agentName={agentName}
          avatarUrl={avatarUrl}
          toolCalls={live.liveToolCalls}
          thought={live.liveThought}
          thoughtAt={live.thoughtAt}
          streamed={live.streamed}
          workingSecs={live.workingSecs}
          notice={live.runNotice}
          summarising={live.summarising}
          actions={workActions}
          renderMarkdown={renderMarkdown}
        />
      )}
    </>
  )

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <PanelChatHeader
          mode={mode} loading={isLoading} connected={isConnected} agentName={agentName} avatarUrl={avatarUrl}
          title={sessionData?.title} primaryLocation={sessionData?.primaryLocation}
          onBack={onBack} onMaximizeToggle={onMaximizeToggle} onClose={onClose}
          onUsage={() => popup.onOpenChange(!popup.open)}
        />
      )}
      {agentStatsBar}

      <div className="relative min-h-0 flex-1">
        <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'thin' }}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><p className="text-small text-text-muted">Loading…</p></div>
          ) : loadFailed && !sessionData ? (
            loadFailed.final !== null
              ? <ReadFailure what="The conversation" final={loadFailed.final} />
              : <ReadFailure what="The conversation" retry={() => setAttempt(a => a + 1)} />
          ) : !hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />
              <p className="max-w-xs text-small leading-relaxed text-text-muted">
                {(sessionData?.metadata as Record<string, unknown> | null)?.welcomeMessage as string ?? `Start a conversation with ${agentName}`}
              </p>
              {threadLine}
            </div>
          ) : (
            <div ref={messagesContentRef} className="space-y-4">
              <ConversationItems
                items={items}
                sessionId={sessionId}
                agentName={agentName}
                avatarUrl={avatarUrl}
                renderMarkdown={renderMarkdown}
                workActions={workActions}
                approvalActions={{ approveManifest: actions.approveManifest, rejectManifest: actions.rejectManifest }}
                approvalFailureAs="thread"
                latestFailureRunId={record?.latestFailure?.runId ?? null}
                agentWorking={live.isSending}
                trying={trying}
                onTryAgain={() => void handleTryAgain()}
                onSendNow={afterWaiting(actions.sendWaitingMessageNow)}
                onCancelWaiting={afterWaiting(actions.cancelWaitingMessage)}
                onAnswered={() => { live.setPendingManifest(null); void refetch() }}
                live={liveBlock}
                legacyApproval={live.pendingManifest}
              />
              {threadLine}
            </div>
          )}
        </div>
        {popup.open && sessionData && (
          <ConversationPopup
            startedAt={sessionData.createdAt}
            model={modelName(currentModel)}
            modelId={currentModel}
            replies={record?.replies ?? 0}
            failed={record?.failed ?? 0}
            total={total}
            contextUse={contextUse}
            agentWorking={live.isSending}
            summarising={live.summarising}
            onSummarise={() => void handleSummarise()}
            onOpenRuns={onOpenConversationRuns ? () => onOpenConversationRuns(latestRunId) : undefined}
            onClose={() => popup.onOpenChange(false)}
          />
        )}
      </div>

      {composerReplacement}

      {!composerReplacement && (
        <>
          <PanelChatComposer
            inputText={inputText}
            onInputChange={setInputText}
            onSend={handleSend}
            notSent={notSent}
            onSendAgain={() => void sendAgain()}
            onStop={handleStop}
            textareaRef={textareaRef}
            isSending={live.isSending}
            sendDisabledReason={sendDisabledReason}
            placeholder={placeholder}
            agentRuntime={conversationRuntime(sessionData)}
            currentModel={currentModel}
            onModelChange={changeModel}
          />
        </>
      )}
    </div>
  )
}
