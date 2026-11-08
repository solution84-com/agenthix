import { useEffect, useId, useState, type ReactNode } from 'react'
import { Button, CONTROL_HEIGHT, Modal } from '@agenthix/ui/primitives'
import { FormTopBar } from '../../shared/layouts/TopBar'
import { INPUT } from '../pages/settings/Part'

const NAME_MAX_LENGTH = 60

/** Whether the shell draws a phone's top bar: below the width its layout changes at (`lg`). */
export function useTopBarScreen(): boolean {
  const query = '(max-width: 1023px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/**
 * A form that is a dialog on a wide screen and a focused page on a phone (spec, *The phone*): ✕ cancels, the title,
 * and its one filled button in the top bar.
 */
function FormFrame({ title, submit, ready, formId, onCancel, children }: {
  title: string
  submit: string
  ready: boolean
  formId: string
  onCancel: () => void
  children: ReactNode
}) {
  const page = useTopBarScreen()
  if (page) {
    return (
      <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-surface-1">
        <FormTopBar title={title} onCancel={onCancel} submit={{ label: submit, formId, disabled: !ready }} />
        <div className="flex flex-col gap-4 px-3 py-4">{children}</div>
      </div>
    )
  }
  return (
    <Modal open onClose={onCancel} title={title}>
      <div className="flex flex-col gap-4">
        {children}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId} disabled={!ready}>{submit}</Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Save as board (the board design, Saving a board A and phone G): a name, and what it shows read back in words; the
 * columns themselves come from the type or the field. Everyone in the project sees saved boards.
 */
export function SaveBoardDialog({ projectName, shows, initial = '', onCancel, onSave }: {
  projectName: string
  /** "Feature request's columns · Sprint: current". */
  shows: string
  initial?: string
  onCancel: () => void
  onSave: (name: string) => void
}) {
  const formId = useId()
  const nameId = useId()
  const [name, setName] = useState(initial)
  const ready = name.trim() !== ''
  return (
    <FormFrame title="Save as board" submit="Save board" ready={ready} formId={formId} onCancel={onCancel}>
      <form id={formId} className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); if (ready) onSave(name.trim()) }}>
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-small font-medium text-text-secondary">Name</label>
          <input id={nameId} autoFocus value={name} maxLength={NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
        </div>
        <div>
          <p className="mb-1.5 text-small font-medium text-text-secondary">What it shows</p>
          <p className="text-body text-text-primary">{shows}</p>
          <p className="mt-1 text-small text-text-muted">Change these on the board before saving; the columns themselves are edited in Settings › Task types.</p>
        </div>
        <p className="text-small text-text-muted">Everyone in {projectName} sees saved boards, in Boards.</p>
      </form>
    </FormFrame>
  )
}

/** Rename…: one name, checked again by the server, which says when it is taken. */
export function RenameBoardDialog({ initial, onCancel, onRename }: { initial: string; onCancel: () => void; onRename: (name: string) => void }) {
  const formId = useId()
  const nameId = useId()
  const [name, setName] = useState(initial)
  const ready = name.trim() !== '' && name.trim() !== initial
  return (
    <FormFrame title={`Rename ${initial}`} submit="Rename" ready={ready} formId={formId} onCancel={onCancel}>
      <form id={formId} onSubmit={e => { e.preventDefault(); if (ready) onRename(name.trim()) }}>
        <label htmlFor={nameId} className="mb-1.5 block text-small font-medium text-text-secondary">Name</label>
        <input id={nameId} autoFocus value={name} maxLength={NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
      </form>
    </FormFrame>
  )
}

/** Deleting a board deletes only the view: the confirm says plainly that its tasks stay (Saved boards, key 8). */
export function DeleteBoardDialog({ name, taskCount, fieldName, onCancel, onDelete }: {
  name: string
  taskCount: number
  /** On a field's board, its values are named as staying too. */
  fieldName: string | null
  onCancel: () => void
  onDelete: () => void
}) {
  const tasks = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`
  const values = fieldName ? `, their ${fieldName} values` : ''
  return (
    <Modal open onClose={onCancel} title={`Delete the board ${name}?`}>
      <p className="text-body text-text-secondary">
        Only the view goes. Its {tasks}{values}, columns, ranks and runs stay as they are, on every other board.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onDelete}>Delete board</Button>
      </div>
    </Modal>
  )
}
