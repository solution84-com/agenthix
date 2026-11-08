import { useEffect, useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { CONTROL_HEIGHT, FilterSelect, FOCUS_RING, SearchField } from '@agenthix/ui/primitives'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import { EPIC_TYPE_ICON } from '@agenthix/core'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { SprintSummary } from '../projectSprintView'
import type { PlanFilter } from './planRules'
import { sprintSpanText, tasksText } from './sprintWords'

const LABEL = 'w-[84px] shrink-0 text-micro text-text-muted'
const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`
const GOAL_MAX = 200

/**
 * The left list's header (the design's key 1): its name and count, Group by epic, then search, Type and Epic. On a
 * phone the list's name is on the switch above it, so the header is the search and Type.
 */
export function BacklogHead({ count, filter, onFilter, types, epics, grouped, onGrouped }: {
  count: number
  filter: PlanFilter
  onFilter: (filter: PlanFilter) => void
  types: Array<{ id: string; name: string }>
  epics: Array<{ id: string; key: string; title: string }>
  grouped: boolean
  onGrouped: (grouped: boolean) => void
}) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2 max-lg:hidden">
          <b className="font-semibold text-text-primary">Backlog and To do</b>
          <span className="text-small text-text-muted">{count} · rank order</span>
          <span className="flex-1" />
          <AutomationSwitch on={grouped} onChange={onGrouped} label="Group by epic" />
          <span className="text-small text-text-secondary">Group by epic</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField label="Search" value={filter.search} onChange={search => onFilter({ ...filter, search })} className="min-w-[8rem] flex-1" />
        <FilterSelect label="Type" value={filter.typeId ?? ''} onChange={v => onFilter({ ...filter, typeId: v || null })}>
          <option value="">Type: all</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </FilterSelect>
        {epics.length > 0 && (
          <span className="max-lg:hidden"><FilterSelect label="Epic" value={filter.epicId ?? ''} onChange={v => onFilter({ ...filter, epicId: v || null })}>
            <option value="">Epic: any</option>
            {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </FilterSelect></span>
        )}
      </div>
    </>
  )
}

function GoalLine({ goal, mayChange, onSave }: { goal: string | null; mayChange: boolean; onSave: (goal: string | null) => void }) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(goal ?? '')
  useEffect(() => { if (!editing) setText(goal ?? '') }, [goal, editing])
  const save = () => {
    setEditing(false)
    if (text.trim() !== (goal ?? '')) onSave(text.trim() || null)
  }
  return (
    <div className="flex min-h-9 items-center gap-2">
      <label htmlFor={id} className={LABEL}>Goal</label>
      {editing ? (
        <input
          id={id} autoFocus value={text} maxLength={GOAL_MAX} placeholder="What this sprint is for, in one line"
          onChange={e => setText(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(goal ?? ''); setEditing(false) } }}
          className={`${CONTROL_HEIGHT} min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2.5 text-small text-text-primary ${FOCUS_RING}`}
        />
      ) : (
        <span id={id} className={`min-w-0 flex-1 truncate text-small ${goal ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>{goal ?? 'No goal yet'}</span>
      )}
      {!editing && (
        <button type="button" aria-label="Edit the goal" title={mayChange ? 'Edit the goal' : VIEWER_CANNOT_WORK} disabled={!mayChange} onClick={() => setEditing(true)} className={ICON_BUTTON}>
          <Pencil size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}

/**
 * The sprint's header (the design's keys 2, 3, 8 and 9): its dates and count, the goal edited in place, the load per
 * agent as a count of tasks (no estimates), the epics it moves forward, and the one line N1 needs said.
 */
export function SprintHead({ sprint, count, isNext, mayChange, onGoal }: {
  sprint: SprintSummary
  count: number
  isNext: boolean
  mayChange: boolean
  onGoal: (goal: string | null) => void
}) {
  const most = Math.max(1, ...sprint.load.map(l => l.count))
  const when = [sprintSpanText(sprint.startDate, sprint.finishDate), sprint.status === 'current' ? 'current' : isNext ? 'next' : null, tasksText(count)]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <b className="font-semibold text-text-primary max-lg:hidden">{sprint.title}</b>
        <span className="text-small text-text-muted">{when.filter(Boolean).join(' · ')}</span>
      </div>
      <GoalLine goal={sprint.goal} mayChange={mayChange} onSave={onGoal} />
      {sprint.load.length > 0 && (
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto whitespace-nowrap">
          <span className={LABEL}>Load (tasks)</span>
          {sprint.load.map(l => (
            <span key={l.agentId} className="inline-flex items-center gap-1.5 text-small text-text-secondary">
              {l.name} {l.count}
              <span aria-hidden className="inline-flex h-1.5 w-8 overflow-hidden rounded-full bg-surface-2">
                <i className="block bg-text-muted" style={{ flex: l.count }} /><i className="block" style={{ flex: most - l.count }} />
              </span>
            </span>
          ))}
        </div>
      )}
      {sprint.epics.length > 0 && (
        <div className="flex min-w-0 items-center gap-4 overflow-x-auto whitespace-nowrap">
          <span className={LABEL}>Epics</span>
          {sprint.epics.map((e, i) => (
            <span key={e.epicId} className="inline-flex items-center gap-1 text-micro text-text-secondary">
              <TaskTypeMark type={{ name: 'Epic', icon: EPIC_TYPE_ICON }} size={12} />{e.title} · {i === 0 ? `${e.count} of its tasks` : e.count}
            </span>
          ))}
        </div>
      )}
      <p className="text-small text-text-muted">A Backlog task dropped here moves to <b className="font-semibold text-text-secondary">To do</b>.</p>
    </div>
  )
}
