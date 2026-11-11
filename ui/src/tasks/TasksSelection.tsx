import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../primitives/Button'
import { Modal } from '../primitives/Modal'
import { NativeSelect } from '../primitives/NativeSelect'
import { FOCUS_RING } from '../primitives/controlStyles'
import type { TaskListOption } from './taskListTypes'

/** One of the actions on ticked lines; `disabledWhy` greys it, with why as its tooltip. */
export interface SelectionAction {
  label: string
  onSelect: () => void
  disabledWhy?: string
}

/**
 * The actions on ticked lines, on a wide screen (T4): a bar floating at the foot of the list with how many are ticked,
 * its actions as outlined buttons, and ✕ to clear the ticks. On a phone the top bar holds them instead.
 */
export function TasksSelectionBar({ count, actions, onClear }: { count: number; actions: SelectionAction[]; onClear: () => void }) {
  const label = `${count} selected`
  return (
    <div className="pointer-events-none sticky bottom-6 z-20 flex justify-center px-4 max-lg:hidden">
      <div role="toolbar" aria-label={label} className="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-popover py-2 pl-4 pr-2 shadow-pop">
        <b className="text-small font-medium text-text-primary">{label}</b>
        <span aria-hidden className="mx-2 w-px self-stretch bg-border-subtle" />
        {actions.map(a => (
          <Button key={a.label} variant="secondary" onClick={a.onSelect} disabled={!!a.disabledWhy} title={a.disabledWhy}>{a.label}</Button>
        ))}
        <button
          type="button" aria-label="Clear the selection" onClick={onClear}
          className={`flex h-9 w-9 items-center justify-center rounded-button text-text-secondary hover:bg-surface-hover ${FOCUS_RING}`}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/**
 * The dialog behind "Set epic…" and "Assign agent…": one choice for every ticked task, then its button. `none` is the
 * choice that clears it ("No epic"), when there is one.
 */
export function TasksPickDialog({ title, label, choices, none, submit, onPick, onClose }: {
  title: string
  label: string
  choices: TaskListOption[]
  none?: string
  submit: string
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const NONE = '__none__'
  const ready = value !== ''
  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-md">
      <form onSubmit={e => { e.preventDefault(); if (ready) onPick(value === NONE ? null : value) }} className="space-y-6">
        <label className="block">
          <span className="mb-1 block text-small font-medium text-text-primary">{label}</span>
          <NativeSelect value={value} onChange={e => setValue(e.target.value)} aria-label={label}>
            <option value="" disabled>Choose…</option>
            {none && <option value={NONE}>{none}</option>}
            {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ready}>{submit}</Button>
        </div>
      </form>
    </Modal>
  )
}
