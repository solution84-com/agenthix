import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import { ConversationItems, type ConversationItemsProps } from './ConversationItems'
import { LiveReply } from './LiveReply'
import { conversationItems, type ConversationItem } from './conversationModel'
import { useLiveRun } from './useLiveRun'
import type { WorkLineActions } from './WorkLineFold'
import type { RenderMarkdown, TranscriptEntry } from './types'

export type SessionTranscriptProps<R extends { entries: TranscriptEntry[] }> = {
  sessionId: string
  socket: Socket | null
  entries: TranscriptEntry[]
  /** Reads the record again when a run ends. */
  refetch: () => Promise<R>
  /** A run known to be going when the view opens, so its live work shows before the first event arrives. */
  runningRunId?: string | null
  latestFailureRunId?: string | null
  agentName: string
  avatarUrl?: string | null
  renderMarkdown?: RenderMarkdown
  actions: WorkLineActions
  /** What this view lets the person do to the record; whatever is left out is absent, not disabled. */
  approvalActions?: ConversationItemsProps['approvalActions']
  onSendNow?: ConversationItemsProps['onSendNow']
  onCancelWaiting?: ConversationItemsProps['onCancelWaiting']
  onTryAgain?: ConversationItemsProps['onTryAgain']
  trying?: boolean
  /** Lines to draw around items, given the items (a task's session marks where each run starts and ends). */
  around?: (items: ConversationItem[]) => ConversationItemsProps['around']
  /** Drawn in place of the record when it holds nothing and nothing is running. */
  emptyState: ReactNode
  label?: string
  className?: string
}

/**
 * A session's record as every view of a run's conversation draws it — who replied and when, the work line, approvals,
 * failures, the icons under each reply — with the reply being written live. The Runs panel, the activity view and a
 * task's session all use it; they differ only in the actions they pass.
 */
export function SessionTranscript<R extends { entries: TranscriptEntry[] }>(p: SessionTranscriptProps<R>) {
  const live = useLiveRun({ socket: p.socket, sessionId: p.sessionId, refetch: p.refetch, onRunEnded: () => {} })
  const { track } = live
  useEffect(() => { if (p.runningRunId) track(p.runningRunId) }, [p.runningRunId, track])

  const items = useMemo(() => conversationItems(p.entries), [p.entries])
  const showLive = live.isSending || !!live.streamed
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // Pinned to the end until the person scrolls up to read; growth never yanks someone who has scrolled away.
  const stick = useRef(true)

  useLayoutEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const pin = () => { if (stick.current) container.scrollTop = container.scrollHeight }
    pin()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(pin)
    ro.observe(content)
    return () => ro.disconnect()
  }, [p.sessionId, items.length === 0 && !showLive])

  const onScroll = () => {
    const el = containerRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const empty = items.length === 0 && !showLive
  return (
    <div ref={containerRef} onScroll={onScroll} aria-label={p.label} className={p.className ?? 'min-h-0 flex-1 overflow-y-auto px-3 py-3'} style={{ scrollbarWidth: 'thin' }}>
      {empty ? p.emptyState : (
        <div ref={contentRef} className="space-y-4">
          <ConversationItems
            items={items}
            sessionId={p.sessionId}
            agentName={p.agentName}
            avatarUrl={p.avatarUrl}
            renderMarkdown={p.renderMarkdown}
            workActions={p.actions}
            approvalActions={p.approvalActions}
            latestFailureRunId={p.latestFailureRunId ?? null}
            agentWorking={live.isSending}
            trying={p.trying}
            onTryAgain={p.onTryAgain}
            onSendNow={p.onSendNow}
            onCancelWaiting={p.onCancelWaiting}
            onAnswered={() => { live.setPendingManifest(null); void p.refetch() }}
            around={p.around?.(items)}
            legacyApproval={live.pendingManifest}
            live={showLive && (
              <LiveReply
                agentName={p.agentName}
                avatarUrl={p.avatarUrl}
                toolCalls={live.liveToolCalls}
                thought={live.liveThought}
                thoughtAt={live.thoughtAt}
                streamed={live.streamed}
                workingSecs={live.workingSecs}
                notice={live.runNotice}
                summarising={live.summarising}
                actions={p.actions}
                renderMarkdown={p.renderMarkdown}
              />
            )}
          />
        </div>
      )}
    </div>
  )
}
