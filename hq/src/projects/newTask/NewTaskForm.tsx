import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { TaskTypeView } from '@agenthix/core'
import { Button, SegmentedControl, CONTROL_HEIGHT, FOCUS_RING, FIELD } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import { NewTaskDescription } from './NewTaskDescription'
import { NewTaskDetails, startsInText, type NewTaskDetailsProps } from './NewTaskDetails'
import {
  canCreate, emptyNewTask, freshAfterCreate, withChange, type NewTaskDefaults, type NewTaskValues,
} from './newTaskState'

export const NEW_TASK_FORM_ID = 'new-task-form'

export interface NewTaskFormProps extends Pick<NewTaskDetailsProps, 'agents' | 'epics' | 'sprints' | 'fields' | 'renderModel' | 'personName'> {
  renderWorkspace: (state: { value: string | null | undefined; onChange: (id: string | null) => void }) => ReactNode
  defaults: NewTaskDefaults
  /** The project's task types; empty while they are read. */
  types: TaskTypeView[]
  /** Makes the task; rejects with the reason, which the dialog shows. A retry after a failure carries on from where it stopped. */
  onCreate: (values: NewTaskValues) => Promise<{ number: number }>
  /** Called with the new task's number when *Create more* is off. */
  onCreated: (created: { number: number }) => void
  onCancel: () => void
  /** Why the person may not make a task here (a project Viewer): every field greyed, and this as Create's tooltip. */
  blockedReason?: string | null
  /** Below `lg` the form's top bar holds Cancel and Create task, so the header bar is left out. */
  topBarOnPhone?: boolean
}

const PRIORITY_WORD: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }
const LABEL = 'mb-1 block text-small font-medium text-text-primary'

/** The folded Details' one line on a phone: "Starts in Reported · Medium". */
function detailsSummary(v: NewTaskValues, types: TaskTypeView[], agents: NewTaskFormProps['agents']): string {
  const where = `Starts in ${startsInText(types, v).replace(/ \(.*\)$/, '')}`
  return [agents.find(a => a.id === v.agentId)?.name, where, PRIORITY_WORD[v.priority] ?? v.priority].filter(Boolean).join(' · ')
}

/**
 * New task (TK1, D11, N2), on a page shaped like the task's own: a header bar with Cancel and Create task, the page's
 * one filled button, at its right (on a phone, the form's top bar: ✕, the title and Create task); then the type,
 * picked first, the title, the description in the one Markdown editor and Create more on the left, and its Details on
 * the right. A failure opens a centred dialog with Try again and keeps what was typed.
 */
export function NewTaskForm({ defaults, types, agents, epics, sprints, fields, renderModel, renderWorkspace, personName, onCreate, onCreated, onCancel, blockedReason, topBarOnPhone = false }: NewTaskFormProps) {
  const [values, setValues] = useState(() => emptyNewTask(defaults, types))
  const [createMore, setCreateMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const title = useRef<HTMLInputElement>(null)

  // The types arrive after the page does: the type and column asked for in the address are taken once they have.
  const typesKnown = types.length > 0
  useEffect(() => {
    if (!typesKnown) return
    setValues(v => {
      if (v.typeId) return v
      const asked = emptyNewTask(defaults, types)
      return { ...v, typeId: asked.typeId, columnId: asked.columnId }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the types first arrive
  }, [typesKnown])

  const change = (patch: Partial<NewTaskValues>) => setValues(v => withChange(v, patch, types))
  const open = types.filter(t => !t.archivedAt)

  const submit = async () => {
    if (busy || blockedReason || !canCreate(values)) return
    setBusy(true)
    setFailure(null)
    try {
      const created = await onCreate(values)
      if (createMore) {
        setValues(freshAfterCreate(values, defaults, types))
        title.current?.focus()
      } else {
        onCreated(created)
      }
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : 'The task wasn’t created. HQ didn’t answer. What you typed is kept.')
    } finally {
      setBusy(false)
    }
  }

  const why = blockedReason ?? (canCreate(values) ? undefined : 'Give the task a title first')
  return (
    <form id={NEW_TASK_FORM_ID} className="flex min-h-0 flex-1 flex-col" onSubmit={e => { e.preventDefault(); void submit() }}>
      {/* Where a task's page has its header: its name, then the page's one filled button at the top right. Below lg
          the form's top bar carries both. */}
      <header aria-label="New task" className={`flex min-h-[52px] shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-1 px-6 py-2 max-sm:px-3 ${topBarOnPhone ? 'max-lg:hidden' : ''}`}>
        <h1 className="text-body font-medium text-text-primary">New task</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy || !!why} title={why}>{busy ? 'Creating…' : 'Create task'}</Button>
        </div>
      </header>
      <fieldset
        disabled={!!blockedReason}
        className="grid min-h-0 min-w-0 flex-1 content-start gap-x-6 gap-y-4 overflow-auto px-6 py-4 max-sm:px-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr]"
      >
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <div>
            <span id="nt-type" className={LABEL}>Type</span>
            {open.length === 0
              ? <span className={`${CONTROL_HEIGHT} inline-flex items-center text-small text-text-muted`}>…</span>
              : <SegmentedControl
                  labelledBy="nt-type" value={values.typeId} onChange={typeId => change({ typeId })}
                  options={open.map(t => ({ value: t.id, label: t.name, icon: <span aria-hidden className="inline-flex"><TaskTypeMark type={t} /></span> }))}
                />}
          </div>
          <div>
            <label htmlFor="nt-title" className={LABEL}>Title</label>
            <input
              id="nt-title" ref={title} required autoFocus value={values.title}
              onChange={e => change({ title: e.target.value })}
              className={`${CONTROL_HEIGHT} w-full rounded-lg px-2.5 text-small ${FIELD}`}
            />
          </div>
          <div className="flex min-h-0 flex-col lg:flex-1">
            <span className={LABEL}>Description</span>
            <NewTaskDescription
              value={values.description} onChange={description => change({ description })}
              onImages={files => change({ files: [...values.files, ...files] })}
            />
          </div>
        </div>
        <aside aria-label="Details" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-border-subtle lg:pl-4">
          <button
            type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(o => !o)}
            className={`flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-small text-text-secondary ${FOCUS_RING} lg:hidden`}
          >
            <span className="font-medium text-text-primary">Details</span>
            <span className="min-w-0 truncate">· {detailsSummary(values, types, agents)}</span>
            {detailsOpen
              ? <ChevronUp size={14} aria-hidden className="ml-auto shrink-0 text-text-muted" />
              : <ChevronDown size={14} aria-hidden className="ml-auto shrink-0 text-text-muted" />}
          </button>
          <div className={`${detailsOpen ? 'mt-4 block' : 'hidden'} lg:mt-0 lg:block`}>
            <NewTaskDetails values={values} onChange={change} types={types} agents={agents} epics={epics} sprints={sprints} fields={fields} renderModel={renderModel} personName={personName}
              renderWorkspace={() => renderWorkspace({ value: values.workspaceId, onChange: workspaceId => change({ workspaceId }) })}
            />
          </div>
        </aside>
        <label className="flex items-center gap-2 self-start text-small text-text-secondary max-sm:min-h-11 lg:col-start-1 lg:row-start-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={createMore} onChange={e => setCreateMore(e.target.checked)} />
          Create more
        </label>
      </fieldset>
      <ShowAttention text={failure} title="The task wasn’t created" retry={() => void submit()} onClose={() => setFailure(null)} />
    </form>
  )
}
