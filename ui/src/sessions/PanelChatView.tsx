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
import { X } from 'lucide-react'
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
import { MemoryNotice } from './MemoryBar'
import type { WorkLineActions } from './WorkLineFold'

export type { PanelChatViewQueries, PanelChatViewActions, PanelChatViewProps } from './panelChatViewTypes'

// ── Component ─────────────────────────────────────────────────────────────────

export function PanelChatView({
  sessionId, socket, queries, actions, renderMarkdown, mode = 'panel', hideHeader, agentName: agentNameProp,
  onBack, onMaximizeToggle, onClose, agentStatsBar, sendDisabledReason, composerReplacement, placeholder,
  onOpenRun, onOpenTarget, canOpenTarget, onOpenConversationRuns, conversationPopup,
}: PanelChatViewProps) {
  const isConnected = socket?.connected ?? false

  const [sessionData, setSessionData] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingManifestFromDb, setPendingManifestFromDb] = useState<PendingManifestData | null>(null)
  const [inputText, setInputText] = useState('')
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ownPopupOpen, setOwnPopupOpen] = useState(false)
  const popup = conversationPopup ?? { open: ownPopupOpen, onOpenChange: setOwnPopupOpen }

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // True until the person scrolls up to read history; asynchronous growth never yanks someone who has scrolled away.
  const stickToBottomRef = useRef(true)

  const refetch = useCallback(() => queries.getSession({ id: sessionId }).then(data => {
    setSessionData(data)
    return data
  }), [queries, sessionId])

  const live = useLiveRun({
    socket, sessionId, refetch,
    onRunEnded: (status, error, record) => {
      setOptimistic(null)
      // A site that does not record a failure in the conversation still has its reason said.
      if (status === 'FAILED' && error && !record.entries.some(e => e.kind === 'RUN_FAILED')) setNotice(error)
    },
  })

  useEffect(() => {
    setIsLoading(true)
    setInputText('')
    setOptimistic(null)
    setNotice(null)
    stickToBottomRef.current = true
    Promise.all([
      queries.getSession({ id: sessionId }).then(data => {
        setSessionData(data)
        // A reply already going when the view opens: follow it, and let Stop reach it.
        const going = data.entries.find(e => e.role === 'USER' && e.runStatus === 'RUNNING' && e.runId)
        if (going?.runId) live.track(going.runId)
      }),
      queries.getSessionPendingManifest({ sessionId }).then(setPendingManifestFromDb),
    ]).finally(() => setIsLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (pendingManifestFromDb && !live.pendingManifest) live.setPendingManifest(pendingManifestFromDb)
  }, [pendingManifestFromDb])

  useMentionTarget(useCallback((text: string) => {
    setInputText(prev => (prev.trim() ? `${prev.trimEnd()} ${text} ` : `${text} `))
    textareaRef.current?.focus()
  }, []))

  const { handleSend, handleStop, handleTryAgain, handleSummarise, afterWaiting, trying } = useConversationActions({
    sessionId, actions, live, refetch, inputText, setInputText, setOptimistic, setNotice, textareaRef, stickToBottomRef, sendDisabledReason,
  })

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

  const workActions: WorkLineActions = { onOpenRun, onOpenTarget: t => onOpenTarget?.(t), canOpenTarget: canOpenTarget ?? (() => false) }
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
          ) : !hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />
              <p className="max-w-xs text-small leading-relaxed text-text-muted">
                {(sessionData?.metadata as Record<string, unknown> | null)?.welcomeMessage as string ?? `Start a conversation with ${agentName}`}
              </p>
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

      {notice && !composerReplacement && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2">
          <span className="flex-1 text-small leading-relaxed text-danger">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 cursor-pointer text-danger/50 hover:text-danger"><X size={12} /></button>
        </div>
      )}

      {!composerReplacement && (
        <>
          <MemoryNotice use={contextUse} agentWorking={live.isSending} summarising={live.summarising} onSummarise={() => void handleSummarise()} />
          <PanelChatComposer
            inputText={inputText}
            onInputChange={setInputText}
            onSend={handleSend}
            onStop={handleStop}
            textareaRef={textareaRef}
            isSending={live.isSending}
            sendDisabledReason={sendDisabledReason}
            placeholder={placeholder}
            agentRuntime={conversationRuntime(sessionData)}
            currentModel={currentModel}
            onModelChange={async model => { await actions.updateSession({ id: sessionId, model }).catch(() => {}) }}
          />
        </>
      )}
    </div>
  )
}
