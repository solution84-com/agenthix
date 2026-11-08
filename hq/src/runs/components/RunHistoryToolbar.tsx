import { useEffect, useState } from 'react'
import { useQuery, getAgents, getProjects } from 'wasp/client/operations'
import { X } from 'lucide-react'
import { AddFilterMenu, FilterSelect, FOCUS_RING, SCROLL_EDGE_FADE, SearchField, SortMenu, type AddFilterKind } from '@agenthix/ui/primitives'
import type { RunHistoryArgs, RunHistoryResult } from '../historyTypes'
import { KIND_CHOICES, SORT_CHOICES, STARTER_CHOICES, WHEN_CHOICES, WHOSE_CHOICES } from './historyWords'
import type { useHistoryParams } from './useHistoryParams'

type Params = ReturnType<typeof useHistoryParams>

const CHIP = 'inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface-1 pl-3 pr-1 text-small text-text-primary max-sm:h-11'

/** A filter a way in arrived with ("Task: WEB-12"), with ✕ to clear it. */
function Chip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className={CHIP}>
      {label}: <b className="font-medium">{value}</b>
      <button
        type="button" aria-label={`Clear ${label}`} onClick={onClear}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`}
      >
        <X size={14} aria-hidden />
      </button>
    </span>
  )
}

/** Typing waits a moment before it asks again, so a search does not read the sites on every key. */
function useSettled(value: string, onSettle: (v: string) => void) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const id = setTimeout(() => onSettle(draft), 300)
    return () => clearTimeout(id)
  }, [draft, value, onSettle])
  return [draft, setDraft] as const
}

/**
 * ＋ Filter holds the filters the row does not show (an assumption the Runs design leaves open): on a project's Runs,
 * Whose; on the organisation's, Started by and Task.
 */
function moreFilters(scope: 'project' | 'mine', tasks: RunHistoryResult['taskChoices']): AddFilterKind[] {
  if (scope === 'project') return [{ key: 'whose', label: 'Whose', choices: WHOSE_CHOICES.slice(1) }]
  return [
    { key: 'startedBy', label: 'Started by', choices: STARTER_CHOICES.slice(1) },
    { key: 'taskKey', label: 'Task', choices: tasks.map(t => ({ value: t.key, label: `${t.key} · ${t.title}` })) },
  ]
}

/**
 * The history's search, filters and sort, one row (the Runs design): the filters a way in arrived with as chips, then
 * Kind, Agent, Task and Started by (a project's) or Project, Kind, Whose and Agent (the organisation's), When,
 * ＋ Filter and Sort. On a phone the row scrolls sideways.
 */
export function RunHistoryToolbar({ scope, params, names, taskChoices = [] }: {
  scope: 'project' | 'mine'
  params: Params
  names: RunHistoryResult['names'] | undefined
  /** The Task filter's choices: the tasks in the scope that have run or wait in line. */
  taskChoices?: RunHistoryResult['taskChoices']
}) {
  const { args, set } = params
  const [search, setSearch] = useSettled(args.search ?? '', v => set('search', v))
  const { data: agents } = useQuery(getAgents)
  const { data: projects } = useQuery(getProjects, undefined, { enabled: scope === 'mine' })
  const agentList = (Array.isArray(agents) ? agents : []) as { id: string; name: string }[]
  const projectList = (Array.isArray(projects) ? projects : []) as { key: string; name: string; personalOwnerId?: string | null }[]

  const select = <K extends keyof RunHistoryArgs>(label: string, key: Parameters<Params['set']>[0], value: RunHistoryArgs[K] | undefined, choices: { value: string; label: string }[]) => (
    <FilterSelect label={label} value={(value as string | undefined) ?? choices[0].value} onChange={v => set(key, v)}>
      {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
    </FilterSelect>
  )

  return (
    <div role="toolbar" aria-label="Search, filter and sort" className="flex flex-wrap items-center gap-2 pt-4 max-sm:flex-col max-sm:items-stretch max-sm:pt-3">
      <SearchField label="Search runs" value={search} onChange={setSearch} className="min-w-[12rem] flex-1 max-sm:min-w-0" />
      <div className={`flex items-center gap-2 max-sm:overflow-x-auto ${SCROLL_EDGE_FADE} sm:contents`}>
        {args.taskKey && <Chip label="Task" value={names?.task ?? args.taskKey} onClear={() => set('taskKey', null)} />}
        {args.conversationId && <Chip label="Conversation" value={names?.conversation ?? '…'} onClear={() => set('conversationId', null)} />}
        {scope === 'project' && args.whose && args.whose !== 'all' && (
          <Chip label="Whose" value={WHOSE_CHOICES.find(c => c.value === args.whose)?.label ?? args.whose} onClear={() => set('whose', null)} />
        )}
        {scope === 'mine' && args.startedBy && args.startedBy !== 'any' && (
          <Chip label="Started by" value={STARTER_CHOICES.find(c => c.value === args.startedBy)?.label ?? args.startedBy} onClear={() => set('startedBy', null)} />
        )}
        {scope === 'mine' && (
          <FilterSelect label="Project" value={args.place ?? ''} onChange={v => set('place', v)}>
            <option value="">Project: all</option>
            {projectList.filter(p => !p.personalOwnerId).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </FilterSelect>
        )}
        {select('Kind', 'kind', args.kind, KIND_CHOICES)}
        {scope === 'mine' && select('Whose', 'whose', args.whose, WHOSE_CHOICES)}
        <FilterSelect label="Agent" value={args.agentId ?? ''} onChange={v => set('agentId', v)}>
          <option value="">Agent: any</option>
          {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </FilterSelect>
        {scope === 'project' && !args.taskKey && (
          // A native select is as wide as its longest option: held to "Task: any" so the row stays one line.
          <span className="inline-flex w-28 shrink-0 max-sm:w-32 [&>label]:w-full [&_select]:w-full [&_select]:truncate">
            <FilterSelect label="Task" value="" onChange={v => set('taskKey', v)}>
              <option value="">Task: any</option>
              {taskChoices.map(t => <option key={t.key} value={t.key}>{t.key} · {t.title}</option>)}
            </FilterSelect>
          </span>
        )}
        {scope === 'project' && select('Started by', 'startedBy', args.startedBy, STARTER_CHOICES)}
        {select('When', 'when', args.when, WHEN_CHOICES)}
        <AddFilterMenu
          kinds={moreFilters(scope, taskChoices)}
          chosen={k => (k === 'whose' ? args.whose : k === 'startedBy' ? args.startedBy : k === 'taskKey' ? args.taskKey : null) ?? null}
          onChoose={(k, v) => set(k as 'whose' | 'startedBy' | 'taskKey', v)}
        />
        <SortMenu value={args.sort ?? 'newest'} choices={SORT_CHOICES} onChange={v => set('sort', v)} />
      </div>
    </div>
  )
}
