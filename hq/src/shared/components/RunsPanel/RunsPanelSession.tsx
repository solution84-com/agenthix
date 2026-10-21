import { useQuery } from 'wasp/client/operations'
import { getActivitySession } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { ArrowLeft, X, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useShellPanels } from '../../context/useShellPanels'
import { useAgentImageUrl } from '../../hooks/useAgentImageUrl'
import {
  AgentAvatar, SessionTranscript, SessionUsageButton, sessionTotals, type TranscriptEntry,
} from '../SessionComponents'
import { MODEL_PRICING } from '../../utils/aiMetrics'
import { AgentControlsBar } from '../AgentControlsBar'
import { MarkdownMessage } from '../MarkdownMessage'
import { useConversationLinks } from '../ChatPanel/useConversationLinks'
import { UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { unreachableSiteCopy } from '../../siteSilence'

type ActivitySession = {
  entries: TranscriptEntry[]
  model?: string | null
  agent?: { id: string; name: string; avatarUrl: string | null } | null
  task?: { number: number; title: string; project: { key: string } } | null
  AgentRun?: { id: string; status: string; manifestStatus?: string | null }[]
  conversation?: { latestFailure: { runId: string } | null }
}

/** A run's conversation in the Runs panel, read-only: the record as a conversation draws it, the run in progress live. */
export function RunsPanelSession({ sessionId }: { sessionId: string }) {
  const { openRuns, close } = useShellPanels()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useQuery(getActivitySession, { sessionId })
  const session = data as ActivitySession | undefined
  // Wasp's client error carries the HTTP status as `statusCode`.
  const notFound = (error as { statusCode?: number } | null)?.statusCode === 404
  // Any other failure is not "no activity": a site that could not be asked is
  // named, anything else is shown as the failure it is.
  const siteCopy = unreachableSiteCopy(error, "this run")
  const { socket, isConnected } = useSocket()
  const links = useConversationLinks(sessionId)

  const agentName = session?.agent?.name ?? 'Agent'
  // Resolved through the authenticated image cache — the image route now
  // requires a session, which AgentAvatar's plain <img src> cannot carry.
  const avatarUrl = useAgentImageUrl(session?.agent?.avatarUrl)
  const taskNumber = session?.task?.number ?? null
  const taskProjectKey = session?.task?.project?.key ?? null
  const taskKey = taskNumber !== null && taskProjectKey ? `${taskProjectKey}-${taskNumber}` : null
  const sessionTitle = session?.task?.title ?? 'Session'
  const sessionModel = session?.model ?? ''
  const latestRun = session?.AgentRun?.[0]
  const runningRunId = latestRun && (latestRun.status === 'RUNNING' || latestRun.status === 'PENDING') && latestRun.manifestStatus !== 'PENDING_APPROVAL'
    ? latestRun.id : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border-subtle shrink-0">
        <button onClick={openRuns} className="p-1 text-text-secondary hover:text-text-primary transition-colors cursor-pointer" title="Back to runs" aria-label="Back to runs">
          <ArrowLeft size={16} />
        </button>
        {!isLoading && <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />}
        <div className="flex-1 min-w-0">
          <p className="text-body font-semibold text-text-primary truncate leading-tight">{agentName}</p>
          <p className="text-micro text-text-muted truncate flex items-center gap-1 leading-tight">
            {sessionTitle}
          </p>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-success' : 'bg-warning'}`} />
        <SessionUsageButton total={sessionTotals(session as never)} model={MODEL_PRICING[sessionModel] ? sessionModel : ''} />
        {taskKey && (
          <button
            onClick={() => navigate(`/tasks/${taskKey}`)}
            title="Open task"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-micro text-text-muted hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-colors cursor-pointer shrink-0"
          >
            <ExternalLink size={10} />
            Task
          </button>
        )}
        <button onClick={close} aria-label="Close runs" className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
          <X size={15} />
        </button>
      </div>

      {/* Agent controls bar */}
      {session?.agent?.id && (
        <AgentControlsBar agentId={session.agent.id} />
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center"><p className="text-small text-text-muted">Loading…</p></div>
      ) : notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-small font-semibold text-text-secondary">Session not found</p>
          <p className="text-micro text-text-muted">This session may have been deleted or is no longer available.</p>
        </div>
      ) : siteCopy ? (
        <div className="flex-1 overflow-y-auto px-3 py-3"><UnansweredSitesNotice copy={siteCopy} /></div>
      ) : error || !session ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-small font-semibold text-danger">Could not load this session</p>
          <p className="text-micro text-text-muted">{(error as Error | null)?.message}</p>
        </div>
      ) : (
        <SessionTranscript
          sessionId={sessionId}
          socket={socket as never}
          entries={session.entries ?? []}
          refetch={() => refetch().then(r => (r.data as ActivitySession | undefined) ?? { entries: [] })}
          runningRunId={runningRunId}
          latestFailureRunId={session.conversation?.latestFailure?.runId ?? null}
          agentName={agentName}
          avatarUrl={avatarUrl}
          renderMarkdown={p => <MarkdownMessage content={p.content} className={p.className} />}
          actions={{ onOpenRun: links.onOpenRun, onOpenTarget: links.onOpenTarget, canOpenTarget: links.canOpenTarget }}
          emptyState={
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />
              <p className="text-small text-text-secondary">Nothing in this run yet</p>
            </div>
          }
        />
      )}
    </div>
  )
}
