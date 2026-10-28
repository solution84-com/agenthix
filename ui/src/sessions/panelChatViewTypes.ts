import type { ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import type { WorkTarget } from '@agenthix/core'
import type { SessionDetail, PendingManifestData, RenderMarkdown } from './types'

// ── Query / action interfaces ─────────────────────────────────────────────────

export interface PanelChatViewQueries {
  getSession: (input: { id: string }) => Promise<SessionDetail>
  getSessionPendingManifest: (input: { sessionId: string }) => Promise<PendingManifestData | null>
}

export interface PanelChatViewActions {
  triggerAgentRun: (input: { sessionId: string; inputText: string }) => Promise<{ id: string }>
  // sessionId rides along (plan 5d-2 task 9a's dispatch flip): a dispatched
  // run's row lives on the Execution Site now, not a local table hq can look
  // up by runId alone — cancelAgentRun resolves ownership + which site to
  // reach via the session instead. Same reasoning as ManifestApprovalBubble's
  // own actions interface.
  cancelAgentRun: (input: { runId: string; sessionId: string }) => Promise<unknown>
  updateSession: (input: { id: string; model?: string; title?: string }) => Promise<unknown>
  approveManifest: (input: { runId: string; sessionId: string }) => Promise<unknown>
  rejectManifest: (input: { runId: string; reason: string; sessionId: string }) => Promise<unknown>
  /** The latest reply, while it is a failure, sent again in a fresh run. */
  tryAgain: (input: { sessionId: string }) => Promise<{ id: string }>
  /** A waiting message goes now: the reply in progress is stopped for it. */
  sendWaitingMessageNow: (input: { sessionId: string; runId: string }) => Promise<unknown>
  /** A waiting message is withdrawn before it starts. */
  cancelWaitingMessage: (input: { sessionId: string; runId: string }) => Promise<unknown>
  /** The agent's runtime summarises its memory of the conversation now. */
  summariseConversation: (input: { sessionId: string }) => Promise<{ id: string }>
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PanelChatViewProps {
  sessionId: string
  socket: Socket | null
  queries: PanelChatViewQueries
  actions: PanelChatViewActions
  renderMarkdown?: RenderMarkdown
  mode?: 'panel' | 'full'
  hideHeader?: boolean
  agentAvatarUrl?: string | null
  agentName?: string
  onBack?: () => void
  onMaximizeToggle?: () => void
  onClose?: () => void
  /**
   * Slot for the agent stats / controls bar shown below the header.
   * In site this is <AgentControlsBar agentId={...} />.
   * Pass null or omit to hide the bar.
   */
  agentStatsBar?: ReactNode
  /** The message box's placeholder; defaults to "Message your agent...". */
  placeholder?: string
  /** When set, the composer is read-only and shows this instead of the placeholder. */
  sendDisabledReason?: string
  /** When set, shown in place of the composer and the run error: the conversation takes no more messages (a closed one). */
  composerReplacement?: ReactNode
  /** Details and "Open the run": the run's page. */
  onOpenRun?: (runId: string) => void
  /** Opens what a change changed; `canOpenTarget` says which changes can be opened. */
  onOpenTarget?: (target: WorkTarget) => void
  canOpenTarget?: (target: WorkTarget) => boolean
  /** A used skill's step as people read it; see `WorkLineActions.skillLabel`. */
  skillLabel?: (name: string, runId: string | null) => string | null
  /** "This conversation's runs ›" in the conversation's popup. */
  onOpenConversationRuns?: (latestRunId: string | null) => void
  /** The conversation's popup, opened from the page's header; without it the view keeps its own. */
  conversationPopup?: { open: boolean; onOpenChange: (open: boolean) => void }
}

