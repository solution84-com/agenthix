import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAction, approveManifest } from 'wasp/client/operations'
import { PanelGroupHeading, PanelItem, PanelItemAction, SearchField, FilterSelect, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { plainReason, runWaitText } from '@agenthix/ui/tasks'
import { AgentAvatar } from '../../shared/components/SessionComponents'
import { useAgentImageUrl } from '../../shared/hooks/useAgentImageUrl'
import { useMayWorkWhere } from '../../shared/hooks/useMayWork'
import { whenText } from '../../shared/components/RunsPanel/panelTime'
import { RUN_GROUPS } from '../../shared/components/RunsPanel/runsListLogic'
import { unansweredSitesCopy, unreachableSiteCopy } from '../../shared/siteSilence'
import { FAILED_PREFIX } from '../runsView'
import type { RunListItem, RunsFilters } from '../screenTypes'
import { durationText } from './runFormat'
import { itemKey, useRunsList } from './useRunsList'
import { AgentFilter, PlaceFilter } from './runFilterOptions'
import { ConversationRunSearch } from './ConversationRunSearch'

type Option = { value: string; label: string }

const RELATIONS: Option[] = [
  { value: 'all', label: 'All of mine' }, { value: 'started', label: 'Started by me' }, { value: 'behalf', label: 'On my behalf' },
]
const WHEN: Option[] = [
  { value: 'any', label: 'Any time' }, { value: 'day', label: 'Last 24 hours' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' },
]
const ENDED: Option[] = [
  { value: 'any', label: 'Any outcome' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }, { value: 'stopped', label: 'Stopped' },
]

/** What a row's second line says: the agent, the place, how it ended, how long it took, and the risky calls it made. */
function detailOf(run: RunListItem): string {
  const outcome = run.outcome ? (run.outcome.startsWith(FAILED_PREFIX) ? `${FAILED_PREFIX}${plainReason(run.outcome.slice(FAILED_PREFIX.length))}` : run.outcome) : null
  const queue = run.group === 'queued' ? runWaitText(run.wait) : null
  return [
    run.agent?.name ?? 'No agent yet',
    run.place.name,
    run.kind === 'conversation' && run.place.projectKey ? 'conversation' : null,
    queue ?? outcome,
    durationText(run.startedAt, run.endedAt),
    run.riskyCalls ? `${run.riskyCalls} risky ${run.riskyCalls === 1 ? 'call' : 'calls'}` : null,
    run.startedByText,
  ].filter(Boolean).join(' · ')
}

function ListRow({ run, selected, onOpen }: { run: RunListItem; selected: boolean; onOpen: (run: RunListItem) => void }) {
  const approve = useAction(approveManifest)
  const mayWork = useMayWorkWhere('key')
  const [busy, setBusy] = useState(false)
  const avatarUrl = useAgentImageUrl(run.agent?.avatarUrl)
  const mayAct = run.kind === 'conversation' || mayWork(run.place.projectKey)
  const canApprove = run.group === 'waiting' && run.runId && run.sessionId && run.outcome === 'wants approval' && mayAct

  return (
    <PanelItem
      icon={run.agent ? <AgentAvatar name={run.agent.name} avatarUrl={avatarUrl} size="sm" /> : undefined}
      itemKey={run.ref}
      title={run.title}
      detail={detailOf(run)}
      time={run.group === 'running' || run.group === 'queued' ? undefined : whenText(run.endedAt ?? run.at)}
      quiet={run.group === 'finished'}
      selected={selected}
      onOpen={() => onOpen(run)}
      action={canApprove ? (
        <PanelItemAction
          look="primary" disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await approve({ runId: run.runId!, sessionId: run.sessionId! }) } catch { onOpen(run) } finally { setBusy(false) }
          }}
        >
          Approve
        </PanelItemAction>
      ) : undefined}
    />
  )
}

/** The person's runs under their filters and search, newest first in four groups, with Older runs › at the end. */
export function RunsList({ selectedRunId, conversationId, onOpen, onFirstPage }: {
  selectedRunId: string | null
  /** Narrows the list to one conversation's runs, as its menu asks (on-screen spec). */
  conversationId?: string | null
  onOpen: (run: RunListItem) => void
  /** Told once, with the newest run, when the list first arrives. */
  onFirstPage?: (newest: RunListItem) => void
}) {
  const [filters, setFilters] = useState<RunsFilters>(conversationId ? { conversationId } : {})
  const [typed, setTyped] = useState('')
  const set = (patch: RunsFilters) => setFilters((f) => ({ ...f, ...patch }))
  const clear = () => { setFilters(conversationId ? { conversationId } : {}); setTyped('') }
  useEffect(() => { setFilters((f) => ({ ...f, conversationId: conversationId ?? undefined })) }, [conversationId])

  const list = useRunsList(filters)
  const told = useRef(false)
  useEffect(() => {
    const newest = list.runs.find((r) => r.runId)
    if (!told.current && !list.isLoading) {
      told.current = true
      if (newest) onFirstPage?.(newest)
    }
  }, [list.isLoading, list.runs, onFirstPage])
  const filtered = Object.values(filters).some((v) => v && v !== 'all' && v !== 'any')
  const siteCopy = unansweredSitesCopy(list.unanswered, 'this list') ?? unreachableSiteCopy(list.error, 'this list')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border-subtle px-3 py-2">
        {filters.conversationId && (
          <p className="flex items-center justify-between gap-2 text-small text-text-secondary" data-testid="conversation-runs-note">
            <span>Only this conversation's runs</span>
            <Link to="/runs" className="shrink-0 text-accent hover:underline">Show all runs</Link>
          </p>
        )}
        <SearchField label="Search runs" value={typed} onChange={(v) => { setTyped(v); set({ search: v.trim() || undefined }) }} placeholder="Search runs" />
        <div role="group" aria-label="Show runs" className="flex gap-1 overflow-x-auto">
          {RELATIONS.map((o) => (
            <button
              key={o.value} type="button" aria-pressed={(filters.relation ?? 'all') === o.value} onClick={() => set({ relation: o.value as RunsFilters['relation'] })}
              className={`shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-micro font-medium transition-colors ${
                (filters.relation ?? 'all') === o.value ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PlaceFilter value={filters.place ?? ''} onChange={(place) => set({ place })} />
          <AgentFilter value={filters.agentId ?? ''} onChange={(agentId) => set({ agentId })} />
          <FilterSelect label="Outcome" value={filters.ended ?? 'any'} onChange={(v) => set({ ended: v as RunsFilters['ended'] })}>
            {ENDED.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Time" value={filters.when ?? 'any'} onChange={(v) => set({ when: v as RunsFilters['when'] })}>
            {WHEN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FilterSelect>
        </div>
      </div>

      {filters.conversationId && <ConversationRunSearch conversationId={filters.conversationId} query={filters.search ?? ''} />}

      <UnansweredSitesNotice copy={siteCopy} className="m-2 shrink-0" />

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {list.isLoading ? (
          <p className="py-8 text-center text-small text-text-muted">Loading…</p>
        ) : list.runs.length === 0 && !list.hasOlder ? (
          filtered ? <NoMatch onClear={clear} /> : <NoRuns />
        ) : (
          <>
            {RUN_GROUPS.map((g) => {
              const rows = list.runs.filter((r) => r.group === g.id)
              if (rows.length === 0) return null
              return (
                <section key={g.id} aria-label={g.label}>
                  <PanelGroupHeading label={g.label} count={g.id === 'finished' ? undefined : rows.length} tone={g.tone} />
                  <ul>{rows.map((r) => <ListRow key={itemKey(r)} run={r} selected={!!r.runId && r.runId === selectedRunId} onOpen={onOpen} />)}</ul>
                </section>
              )
            })}
            {list.runs.length === 0 && list.hasOlder && <p className="px-3 py-6 text-center text-small text-text-muted">No runs on this page match.</p>}
            {list.failed && <p role="alert" className="px-3 py-2 text-small text-danger">Could not load older runs.</p>}
            {list.hasOlder && (
              <button
                type="button" onClick={() => void list.loadOlder()} disabled={list.loadingOlder}
                className="w-full cursor-pointer px-3 py-3 text-center text-small text-accent hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
              >
                {list.loadingOlder ? 'Loading…' : 'Older runs ›'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function NoRuns() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-body font-medium text-text-secondary">No runs yet</p>
      <p className="text-small text-text-muted">A run appears here when an agent starts work for you: a message in a conversation, a task starting, a routine firing.</p>
      <Link to="/chat" className="mt-1 rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-on-accent hover:bg-accent-hover">Start a conversation</Link>
    </div>
  )
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-body font-medium text-text-secondary">No runs match</p>
      <button type="button" onClick={onClear} className="cursor-pointer text-small text-accent hover:underline">Clear the filters</button>
    </div>
  )
}
