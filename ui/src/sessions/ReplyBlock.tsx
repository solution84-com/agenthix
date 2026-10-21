import type { ReactNode } from 'react'
import { workLine } from '@agenthix/core'
import { AgentAvatar, formatTime } from './SessionComponents'
import { FoldedLine } from './FoldedLine'
import { WorkLineFold, WorkSteps, toWorkEntry, type WorkLineActions } from './WorkLineFold'
import { ReplyActions } from './ReplyActions'
import { failedReason, lowerFirst, stoppedLine, type ReplyItem } from './conversationModel'
import { defaultRenderMarkdown, type RenderMarkdown } from './types'

/** Avatar on the left, then "Name · 10:26" over whatever the reply holds. */
export function ReplyFrame({ agentName, avatarUrl, meta, children }: { agentName: string; avatarUrl?: string | null; meta: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <AgentAvatar name={agentName} avatarUrl={avatarUrl} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-1.5 text-small">
          <span className="font-semibold text-text-primary">{agentName}</span>
          <span aria-hidden className="text-text-muted">·</span>
          <span className="text-text-muted">{meta}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * A run that did not finish, folded to one line in the work line's style: "✕ Failed · 10:31 · the site lost its
 * connection to the model", "Stopped by you · 10:41 · read 3 files, changed 1". Opened, what it did and why it ended.
 */
function EndedLine({ item, actions }: { item: ReplyItem; actions: WorkLineActions }) {
  const ending = item.ending!
  const line = workLine(item.work.map(toWorkEntry))
  const did = line.summary ? lowerFirst(line.summary) : ''
  const failed = ending.kind === 'RUN_FAILED'
  const label = failed
    ? <><span className="text-danger">✕</span> Failed · {formatTime(ending.createdAt)}{failedReason(ending) && ` · ${failedReason(ending)}`}</>
    : <>{stoppedLine(ending)} · {formatTime(ending.createdAt)}{did && ` · ${did}`}</>
  return (
    <FoldedLine label={label}>
      <WorkSteps steps={line.steps} runId={item.runId} actions={actions} />
    </FoldedLine>
  )
}

export function ReplyBlock({ item, agentName, avatarUrl, renderMarkdown, actions, model, latestFailure, running, onTryAgain, trying }: {
  item: ReplyItem
  agentName: string
  avatarUrl?: string | null
  renderMarkdown?: RenderMarkdown
  actions: WorkLineActions
  /** The model the reply was written with, for its cost estimate. */
  model?: string | null
  /** This reply is the conversation's latest and it failed. */
  latestFailure: boolean
  running: boolean
  onTryAgain?: () => void
  trying: boolean
}) {
  const md = renderMarkdown ?? defaultRenderMarkdown
  const { assistant, ending } = item
  const failedNow = latestFailure && ending?.kind === 'RUN_FAILED'
  return (
    <ReplyFrame agentName={agentName} avatarUrl={avatarUrl} meta={formatTime(item.at)}>
      {/* A run that ended early shows its steps behind its own line; otherwise they are the work line. */}
      {(failedNow || !ending) && <WorkLineFold entries={item.work} runId={item.runId} actions={actions} />}
      {assistant && <div className="max-w-[720px] text-reading">{md({ content: assistant.content })}</div>}
      {failedNow && (
        <div className="space-y-2">
          <p className="text-small text-text-secondary">{(ending!.detail as { reason?: string } | null)?.reason ?? 'Something went wrong while the agent was working.'}</p>
          {onTryAgain && (
            <button type="button" onClick={onTryAgain} disabled={running || trying} className="rounded-lg border border-border px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 max-lg:min-h-10">
              Try again
            </button>
          )}
        </div>
      )}
      {ending && !failedNow && <EndedLine item={item} actions={actions} />}
      {assistant && <ReplyActions text={assistant.content} usage={assistant.usage} model={model ?? assistant.model} runId={item.runId} onOpenRun={actions.onOpenRun} />}
    </ReplyFrame>
  )
}
