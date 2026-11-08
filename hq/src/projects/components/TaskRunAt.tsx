import { useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'
import { Button, DateField, MENU_ITEM, Modal, PopSheet, fieldDayText } from '@agenthix/ui/primitives'

const two = (n: number) => String(n).padStart(2, '0')

/** A time as a `datetime-local` value, in the person's own zone; '' for none. */
export function localDateTime(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}

/** "Not scheduled", or "12 Nov, 09:00": when Run at… starts the task. */
export function startsText(at: string | Date | null | undefined, now: Date = new Date()): string {
  const value = localDateTime(at)
  return value ? fieldDayText(value, true, now) : 'Not scheduled'
}

/**
 * The header's one filled button on a task that may be run (D6): Run ▾, opening Run now and Run at… a date and time.
 * Greyed, with why, where it cannot run (no agent, a Viewer).
 */
export function TaskRunButton({ disabledWhy, busy, onRunNow, onRunAt }: {
  disabledWhy?: string
  busy?: boolean
  onRunNow: () => void
  onRunAt: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button
        aria-haspopup="menu" aria-expanded={open} disabled={!!disabledWhy || busy} title={disabledWhy}
        leadingIcon={<Play size={14} aria-hidden />} onClick={() => setOpen(o => !o)}
      >
        Run<ChevronDown size={14} aria-hidden />
      </Button>
      {open && (
        <PopSheet label="Run" onClose={() => setOpen(false)} width="sm:w-56">
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { setOpen(false); onRunNow() }}>
            <span className="font-medium">Run now</span>
          </button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { setOpen(false); onRunAt() }}>
            <span>
              <span className="block font-medium">Run at…</span>
              <span className="block text-micro text-text-muted">a date and time</span>
            </span>
          </button>
        </PopSheet>
      )}
    </div>
  )
}

/**
 * Run at… (D6): the one time the task is started, in the person's own zone. Clear takes the time away; nothing else
 * starts it.
 */
export function TaskRunAtDialog({ open, at, onClose, onSave, onClear }: {
  open: boolean
  at: string | Date | null | undefined
  onClose: () => void
  /** The time as an ISO string. */
  onSave: (at: string) => void
  onClear: () => void
}) {
  const [value, setValue] = useState(() => localDateTime(at))
  const [shownFor, setShownFor] = useState(open)
  // Each opening starts from the time the task has now.
  if (open !== shownFor) {
    setShownFor(open)
    if (open) setValue(localDateTime(at))
  }
  const past = value !== '' && new Date(value).getTime() <= Date.now()
  return (
    <Modal open={open} onClose={onClose} title="Run at…" maxWidth="max-w-md">
      <form
        className="space-y-4"
        onSubmit={e => { e.preventDefault(); if (value && !past) { onSave(new Date(value).toISOString()); onClose() } }}
      >
        <label className="block space-y-1">
          <span className="block text-small font-medium text-text-primary">When it starts</span>
          <DateField aria-label="When it starts" withTime value={value} emptyText="Choose a date and time" onChange={e => setValue(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          {at && <Button type="button" variant="secondary" onClick={() => { onClear(); onClose() }}>Clear</Button>}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!value || past} title={past ? 'Choose a time still to come' : undefined}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}
