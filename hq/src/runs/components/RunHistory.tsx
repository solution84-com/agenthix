import { useCallback } from 'react'
import { useAction, useQuery, getRunHistory, stopTask, stopTaskSession } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, EmptyState, FilterTabs, Tooltip, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import type { OverflowItem } from '@agenthix/ui/tasks'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWorkWhere, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { refusalText } from '../../shared/refusal'
import { unansweredSitesCopy, unreachableSiteCopy } from '../../shared/siteSilence'
import type { HistoryState, RunHistoryResult, RunHistoryRow as Row } from '../historyTypes'
import { RunHistoryRow, HISTORY_COLUMNS } from './RunHistoryRow'
import { RunHistoryToolbar } from './RunHistoryToolbar'
import { needsLine, pagerText, TAB_LABEL, TABS } from './historyWords'
import { useHistoryParams } from './useHistoryParams'
import { ReadFailure } from '@agenthix/ui/attention'

const PAGER_BUTTON = 'h-9 w-9 justify-center px-0! max-sm:h-11 max-sm:w-11'
export const REPLY_NOT_YOURS = 'Only the person whose conversation it is can open it.'
export const REPLY_NO_CONVERSATION = 'This reply has no conversation to open.'

/**
 * The Runs history, below a page's heading (the Runs design): the tabs by state with their counts, search, filters and
 * sort, one row per run newest first, twenty at a time. A row opens the run; its ⋯ offers Stop while it runs and the
 * task or conversation it belongs to. A project's (`projectKey`) lists every run in it; without one, the person's own.
 */
export function RunHistory({ projectKey, onOpenRun, onOpenTarget }: {
  projectKey?: string
  onOpenRun: (row: Row) => void
  onOpenTarget: (href: string) => void
}) {
  const scope = projectKey ? 'project' : 'mine'
  const params = useHistoryParams(projectKey)
  const { args, set, clear } = params
  const { data, error, isLoading, refetch } = useQuery(getRunHistory, args)
  const result = data as RunHistoryResult | undefined
  useSocketListener('agentRunStatus', useCallback(() => { void refetch() }, [refetch]))
  const attention = useAttention()
  const mayWork = useMayWorkWhere('key')
  const stopOne = useAction(stopTask)
  const stopReply = useAction(stopTaskSession)

  const tab = (args.state ?? 'all') as HistoryState
  const filtered = !!(args.kind || args.when || args.whose || args.startedBy || args.agentId || args.taskKey || args.place || args.conversationId || args.search)

  const stop = (row: Row) => {
    const work = row.kind === 'task' && row.taskId ? stopOne({ taskId: row.taskId }) : stopReply({ sessionId: row.sessionId })
    work.then(() => refetch(), err => attention.show({ title: 'The run was not stopped', text: refusalText(err), retry: () => stop(row) }))
  }
  const actionsOf = (row: Row): OverflowItem[] => {
    const live = row.group === 'running' || row.group === 'waiting'
    const may = row.kind === 'reply' ? row.openable : mayWork(row.place.projectKey)
    return [
      ...(live && (row.kind !== 'reply' || row.openable) ? [{ label: 'Stop', onSelect: () => stop(row), disabledReason: may ? undefined : VIEWER_CANNOT_WORK }] : []),
      ...(row.href ? [{ label: row.kind === 'task' ? 'Open the task' : 'Open the conversation', onSelect: () => onOpenTarget(row.href!) }] : []),
      // A reply always offers its conversation; another person's is greyed with why (ADR-0077).
      ...(!row.href && row.kind === 'reply' ? [{ label: 'Open the conversation', onSelect: () => {}, disabledReason: row.openable ? REPLY_NO_CONVERSATION : REPLY_NOT_YOURS }] : []),
    ]
  }

  const siteCopy = unreachableSiteCopy(error, 'these runs')
  if (error && !siteCopy) return <ReadFailure what="The runs" retry={() => void refetch()} />

  const counts = result?.counts
  const needs = result && counts ? needsLine(counts, result.needs) : null
  return (
    <>
      <FilterTabs
        label="Show runs" value={tab} onChange={v => set('state', v)} className="pt-4 max-sm:pt-3"
        tabs={TABS.map(t => ({ value: t, label: TAB_LABEL[t], count: counts?.[t], title: t === 'needs' && needs ? needs : undefined }))}
      />
      {needs && <p className="pt-1 text-micro text-text-muted">{needs}</p>}
      <RunHistoryToolbar scope={scope} params={params} names={result?.names} taskChoices={result?.taskChoices} />
      <UnansweredSitesNotice copy={siteCopy ?? (result ? unansweredSitesCopy(result.unanswered, 'these runs') : null)} className="mt-3" />

      <div className="pt-3">
        <div className={`hidden gap-x-3 border-b border-border-subtle px-2 py-1.5 text-micro font-medium uppercase tracking-wide text-text-muted lg:grid ${HISTORY_COLUMNS}`}>
          <span>Run</span><span>What</span><span>Agent</span><span>Took</span><span>Cost</span><span>Started by</span><span />
        </div>
        {isLoading || !result ? (
          <p className="py-6 text-small text-text-muted">Reading the runs…</p>
        ) : result.rows.length === 0 ? (
          <div className="pt-3">
            {result.nothingYet && !filtered
              ? <EmptyState variant="inline" title={scope === 'project' ? 'Nothing has run in this project yet. Agents start work from the Workroom.' : 'Nothing of yours has run yet. Runs you start, and runs on your behalf, show here.'} />
              : <EmptyState variant="inline" title="No runs match these filters. Clear a filter, or see every run." action={<Button variant="secondary" onClick={clear}>See every run</Button>} />}
          </div>
        ) : (
          <ul aria-label="Runs">
            {result.rows.map(row => (
              <RunHistoryRow
                key={row.runId} row={row} withPlace={scope === 'mine'} actions={actionsOf(row)}
                onOpen={row.openable ? () => onOpenRun(row) : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {result && result.total > 0 && (
        <div className="flex items-center justify-end gap-2 pt-3 text-small text-text-muted">
          <span>{pagerText(result, args.sort ?? 'newest')}</span>
          <Tooltip label="Newer" side="top">
            <Button variant="secondary" className={PAGER_BUTTON} aria-label="Newer" disabled={result.page <= 1} onClick={() => set('page', result.page - 1)}>
              <ChevronLeft size={16} aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip label="Older" side="top">
            <Button variant="secondary" className={PAGER_BUTTON} aria-label="Older" disabled={result.page * result.pageSize >= result.total} onClick={() => set('page', result.page + 1)}>
              <ChevronRight size={16} aria-hidden />
            </Button>
          </Tooltip>
        </div>
      )}
      {attention.dialog}
    </>
  )
}
