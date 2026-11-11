import { useId, useState, type ReactNode } from 'react'
import { Button, CARD_CHOSEN, CARD_CLICKABLE, CONTROL_HEIGHT, DateField, Modal, NativeSelect } from '@agenthix/ui/primitives'
import { INPUT } from '../pages/settings/Part'
import { lengthText, nextMondayValue, sprintSpanText } from './sprintWords'

const LABEL = 'mb-1.5 block text-small text-text-secondary'
const LENGTHS = [7, 14, 21, 28]
const NAME_MAX = 120

function Foot({ onCancel, confirm, disabled, onConfirm }: { onCancel: () => void; confirm: string; disabled?: boolean; onConfirm?: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type={onConfirm ? 'button' : 'submit'} disabled={disabled} onClick={onConfirm}>{confirm}</Button>
    </div>
  )
}

function LengthSelect({ id, days, onChange }: { id: string; days: number; onChange: (days: number) => void }) {
  const lengths = LENGTHS.includes(days) ? LENGTHS : [...LENGTHS, days].sort((a, b) => a - b)
  return (
    <NativeSelect id={id} value={String(days)} onChange={e => onChange(Number(e.target.value))}>
      {lengths.map(d => <option key={d} value={d}>{lengthText(d)}</option>)}
    </NativeSelect>
  )
}

/** Start sprints (the design's key 7): how long each sprint is, and when the first begins. */
export function StartSprintsDialog({ onCancel, onStart }: { onCancel: () => void; onStart: (startDate: string, days: number) => void }) {
  const lengthId = useId()
  const startId = useId()
  const [days, setDays] = useState(14)
  const [start, setStart] = useState(nextMondayValue())
  return (
    <Modal open onClose={onCancel} title="Start sprints">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (start) onStart(start, days) }}>
        <p className="text-body text-text-secondary">One series for the project: each sprint the same length, one after another. Every type shares it.</p>
        <div>
          <label htmlFor={lengthId} className={LABEL}>Each sprint lasts</label>
          <LengthSelect id={lengthId} days={days} onChange={setDays} />
        </div>
        <div>
          <label htmlFor={startId} className={LABEL}>The first begins</label>
          <DateField id={startId} value={start} onChange={e => setStart(e.target.value)} required />
        </div>
        <Foot onCancel={onCancel} confirm="Start sprints" disabled={!start} />
      </form>
    </Modal>
  )
}

/** Sprint length… (the design's key 6): one length for the series; the current sprint keeps its dates. */
export function SprintLengthDialog({ days: initial, onCancel, onSave }: { days: number; onCancel: () => void; onSave: (days: number) => void }) {
  const id = useId()
  const [days, setDays] = useState(initial)
  return (
    <Modal open onClose={onCancel} title="Sprint length">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (days !== initial) onSave(days) }}>
        <div>
          <label htmlFor={id} className={LABEL}>Each sprint lasts</label>
          <LengthSelect id={id} days={days} onChange={setDays} />
        </div>
        <p className="text-small text-text-muted">The current sprint keeps its dates, as it is under way. The sprints after it follow it at the new length.</p>
        <Foot onCancel={onCancel} confirm="Save" disabled={days === initial} />
      </form>
    </Modal>
  )
}

/** Rename: a name after the number, which stays ("Sprint 4 · Pricing push"); empty takes the name away. */
export function RenameSprintDialog({ number, name: initial, onCancel, onSave }: {
  number: number
  name: string | null
  onCancel: () => void
  onSave: (name: string | null) => void
}) {
  const id = useId()
  const [name, setName] = useState(initial ?? '')
  const changed = name.trim() !== (initial ?? '')
  return (
    <Modal open onClose={onCancel} title={`Rename Sprint ${number}`}>
      <form onSubmit={e => { e.preventDefault(); if (changed) onSave(name.trim() || null) }}>
        <label htmlFor={id} className={LABEL}>Name</label>
        <input id={id} autoFocus value={name} maxLength={NAME_MAX} placeholder="None" onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
        <p className="mt-2 text-small text-text-muted">Its number stays: Sprint {number}{name.trim() ? ` · ${name.trim()}` : ''}.</p>
        <Foot onCancel={onCancel} confirm="Rename" disabled={!changed} />
      </form>
    </Modal>
  )
}

function Choice({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" role="radio" aria-checked={on} onClick={onPick}
      className={`flex w-full items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left text-small text-text-secondary ${CARD_CLICKABLE} ${on ? CARD_CHOSEN : ''}`}
    >
      <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent' : 'border-border-strong'}`}>
        {on && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}

export type FinishNext = { title: string; startDate: Date; finishDate: Date } | { title: string; startDate?: undefined; finishDate?: undefined }

/**
 * Finish Sprint 4? (spec N7, the design's key 5): its done tasks stay recorded in it, and the rest go to the next
 * sprint or to none. Their task state and column stay. Asked only while a task is not done.
 */
export function FinishSprintDialog({ title, done, open, next, onCancel, onFinish }: {
  title: string
  done: number
  open: number
  /** The sprint after it: one planned already, or the one finishing makes. */
  next: FinishNext
  onCancel: () => void
  onFinish: (unfinished: 'next' | 'none') => void
}) {
  const [to, setTo] = useState<'next' | 'none'>('next')
  return (
    <Modal open onClose={onCancel} title={`Finish ${title}?`}>
      <div className="space-y-4">
        <p className="text-body text-text-secondary">
          <b className="font-medium text-text-primary">{done} done</b> stay recorded in {title}. Where do the <b className="font-medium text-text-primary">{open} not done</b> go?
        </p>
        <div role="radiogroup" aria-label="Where the tasks not done go" className="flex flex-col gap-2">
          <Choice on={to === 'next'} onPick={() => setTo('next')}>
            <b className="font-medium text-text-primary">{next.title}</b>
            {next.startDate ? ` · ${sprintSpanText(next.startDate, next.finishDate)}, the next one` : ' · the next one, made now'}
          </Choice>
          <Choice on={to === 'none'} onPick={() => setTo('none')}>
            <b className="font-medium text-text-primary">No sprint</b> · plan them again
          </Choice>
        </div>
        <p className="text-small text-text-muted">Their task state and column stay as they are.</p>
        <Foot onCancel={onCancel} confirm="Finish sprint" onConfirm={() => onFinish(to)} />
      </div>
    </Modal>
  )
}
