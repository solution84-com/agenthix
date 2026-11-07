import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button, ModalDialog } from '@agenthix/ui/primitives'
import { NewTaskDescription } from './NewTaskDescription'
import { NewTaskDetails, type NewTaskDetailsProps } from './NewTaskDetails'
import {
  canCreate, emptyNewTask, freshAfterCreate, withChange, type NewTaskDefaults, type NewTaskValues,
} from './newTaskState'

export interface NewTaskFormProps extends Pick<NewTaskDetailsProps, 'agents' | 'boards' | 'epics' | 'renderModel'> {
  defaults: NewTaskDefaults
  renderWorkspace: (state: { value: string | null | undefined; onChange: (id: string | null) => void }) => ReactNode
  /** Makes the task; rejects with the reason, which the dialog shows. A retry after a failure carries on from where it stopped. */
  onCreate: (values: NewTaskValues) => Promise<{ number: number }>
  /** Called with the new task's number when *Create more* is off. */
  onCreated: (created: { number: number }) => void
  onCancel: () => void
  /** Why the person may not make a task here (a project Viewer): every field greyed, and this as Create's tooltip. */
  blockedReason?: string | null
  /** Beside the title in the header bar: the project it is made in. */
  projectName?: string
}

const PRIORITY_WORD: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

/** The folded Details' one line on a phone, as a task's page has: "Dana · Medium". */
function detailsSummary(v: NewTaskValues, agents: NewTaskFormProps['agents']): string {
  return [agents.find(a => a.id === v.agentId)?.name ?? 'No agent', PRIORITY_WORD[v.priority] ?? v.priority].join(' · ')
}

/**
 * A new task, on a page shaped like the task's own: a header bar with Create more, Cancel and Create task at its right,
 * then the title and description on the left and its Details on the right. A failure opens a dialog with Try again and keeps what was typed.
 */
export function NewTaskForm({ defaults, agents, boards, epics, renderModel, renderWorkspace, onCreate, onCreated, onCancel, blockedReason, projectName }: NewTaskFormProps) {
  const [values, setValues] = useState(() => emptyNewTask(defaults, boards))
  const [createMore, setCreateMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const title = useRef<HTMLInputElement>(null)

  // The boards arrive after the page does: the board and column asked for in the address are taken once they have.
  const boardsKnown = boards.length > 0
  useEffect(() => {
    if (!boardsKnown || !defaults.boardId) return
    setValues(v => {
      if (v.boardId) return v
      const asked = emptyNewTask(defaults, boards)
      return { ...v, boardId: asked.boardId, column: asked.column }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the boards first arrive
  }, [boardsKnown])

  const change = (patch: Partial<NewTaskValues>) => setValues(v => withChange(v, patch, boards))

  const submit = async () => {
    if (busy || blockedReason || !canCreate(values)) return
    setBusy(true)
    setFailure(null)
    try {
      const created = await onCreate(values)
      if (createMore) {
        setValues(freshAfterCreate(values, defaults, boards))
        title.current?.focus()
      } else {
        onCreated(created)
      }
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : 'The task could not be created. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={e => { e.preventDefault(); void submit() }}>
      {/* Where a task's page has its header: its name, then the page's one filled button at the top right (A5). Below
          lg the top bar carries the name, so only the buttons stay. */}
      <header aria-label="New task" className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-0 px-4 py-2">
        <h1 className="text-h3 font-semibold text-text-primary max-lg:hidden">New task</h1>
        {projectName && <span className="min-w-0 truncate text-small text-text-muted max-lg:hidden">in {projectName}</span>}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-small text-text-secondary max-sm:min-h-11">
            <input type="checkbox" className="h-4 w-4" checked={createMore} disabled={!!blockedReason} onChange={e => setCreateMore(e.target.checked)} />
            Create more
          </label>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy || !!blockedReason || !canCreate(values)} title={blockedReason ?? (canCreate(values) ? undefined : 'Give the task a title first')}>{busy ? 'Creating…' : 'Create task'}</Button>
        </div>
      </header>
      <fieldset disabled={!!blockedReason} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-auto px-4 py-4 lg:flex-row">
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
          <input
            ref={title} aria-label="Title" required autoFocus placeholder="Title" value={values.title}
            onChange={e => change({ title: e.target.value })}
            className="w-full border-0 border-b border-border-subtle bg-transparent pb-2 text-h2 font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <NewTaskDescription
            value={values.description} onChange={description => change({ description })}
            onImages={files => change({ files: [...values.files, ...files] })}
          />
        </div>
        <div className="lg:w-[17rem] lg:shrink-0 lg:border-l lg:border-border-subtle lg:pl-4">
          <button
            type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(o => !o)}
            className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-small text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <span className="font-medium text-text-primary">Details</span>
            <span className="min-w-0 truncate">· {detailsSummary(values, agents)}</span>
            {detailsOpen
              ? <ChevronUp size={14} aria-hidden className="ml-auto shrink-0 text-text-muted" />
              : <ChevronDown size={14} aria-hidden className="ml-auto shrink-0 text-text-muted" />}
          </button>
          <div className={`${detailsOpen ? 'block' : 'hidden'} lg:block`}>
            <NewTaskDetails
              values={values} onChange={change} agents={agents} boards={boards} epics={epics} renderModel={renderModel}
              renderWorkspace={() => renderWorkspace({ value: values.workspaceId, onChange: workspaceId => change({ workspaceId }) })}
            />
          </div>
        </div>
      </fieldset>
      <ModalDialog open={failure !== null} onClose={() => setFailure(null)} title="The task was not created" maxWidth="max-w-md">
        <p role="alert" className="text-body text-text-secondary">{failure}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setFailure(null)}>Close</Button>
          <Button type="button" onClick={() => void submit()}>Try again</Button>
        </div>
      </ModalDialog>
    </form>
  )
}
