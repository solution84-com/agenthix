import { useEffect, useRef, useState, type ReactNode } from 'react'
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
}

/**
 * A new task, on a page shaped like the task's own: title and description on the left, its Details on the right, and
 * Create more, Cancel and Create task below. A failure opens a dialog with Try again and keeps what was typed.
 */
export function NewTaskForm({ defaults, agents, boards, epics, renderModel, renderWorkspace, onCreate, onCreated, onCancel }: NewTaskFormProps) {
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
    if (busy || !canCreate(values)) return
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
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 py-4 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <input
            ref={title} aria-label="Title" required autoFocus placeholder="Title" value={values.title}
            onChange={e => change({ title: e.target.value })}
            className="w-full border-0 border-b border-border-subtle bg-transparent pb-2 text-h1 font-semibold text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <NewTaskDescription
            value={values.description} onChange={description => change({ description })}
            onImages={files => change({ files: [...values.files, ...files] })}
          />
        </div>
        <div className="lg:w-72 lg:shrink-0">
          <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(o => !o)}
            className="mb-3 text-small font-medium text-text-secondary lg:hidden">
            {detailsOpen ? 'Hide details' : 'Details'}
          </button>
          <div className={`${detailsOpen ? 'block' : 'hidden'} lg:block`}>
            <NewTaskDetails
              values={values} onChange={change} agents={agents} boards={boards} epics={epics} renderModel={renderModel}
              renderWorkspace={() => renderWorkspace({ value: values.workspaceId, onChange: workspaceId => change({ workspaceId }) })}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-4 py-3">
        <label className="mr-auto flex items-center gap-2 text-small text-text-secondary">
          <input type="checkbox" checked={createMore} onChange={e => setCreateMore(e.target.checked)} />
          Create more
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !canCreate(values)}>{busy ? 'Creating…' : 'Create task'}</Button>
      </div>
      <ModalDialog open={failure !== null} onClose={() => setFailure(null)} title="The task was not created" maxWidth="max-w-md">
        <p role="alert" className="text-body text-text-secondary">{failure}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setFailure(null)}>Close</Button>
          <Button type="button" size="sm" onClick={() => void submit()}>Try again</Button>
        </div>
      </ModalDialog>
    </form>
  )
}
