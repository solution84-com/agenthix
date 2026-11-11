import { useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Tooltip } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { RoutineSummary } from '../../shared/routineTypes'
import { FIELD, ICON_BUTTON } from './routineStyles'
import { routineRing, whoWords, type Me } from './routineWords'

/** The routine's name, renamed in place (✎); Save is a change, so it may ask first (N6). */
export function RoutineName({ title, editing, onEdit, onDone, onSave, readOnlyWhy }: {
  title: string
  editing: boolean
  onEdit: () => void
  onDone: () => void
  onSave: (title: string) => Promise<boolean>
  readOnlyWhy?: string
}) {
  const [draft, setDraft] = useState(title)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(title) }, [title, editing])
  const save = async () => {
    const next = draft.trim()
    if (!next || next === title) { onDone(); return }
    setSaving(true)
    const saved = await onSave(next)
    setSaving(false)
    if (saved) onDone()
  }
  if (editing) {
    return (
      <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void save() }}>
        <input autoFocus aria-label="Name" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onDone() }}
          className={`${FIELD} min-w-0 flex-1 text-h3 font-medium`} />
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="secondary" disabled={saving || !draft.trim()}>Save</Button>
      </form>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <h2 className="truncate text-h2 font-medium text-text-primary">{title}</h2>
      <Tooltip label={readOnlyWhy ?? 'Rename'}>
        <button type="button" aria-label="Rename" disabled={!!readOnlyWhy} onClick={onEdit} className={ICON_BUTTON}><Pencil size={14} aria-hidden /></button>
      </Tooltip>
    </div>
  )
}

/** Its agent (ringed while its run goes, D18) and on whose behalf it runs: the last person who changed it. */
export function RoutineWho({ routine, me, children }: { routine: RoutineSummary; me: Me; children?: ReactNode }) {
  const agent = routine.agent?.name ?? 'No agent'
  return (
    <div className="flex min-w-0 items-center gap-2">
      <RunAvatar name={agent} state={routineRing(routine)}><AuthedAgentAvatar name={agent} size="md" /></RunAvatar>
      <span className="min-w-0 flex-1 truncate text-small text-text-muted">{whoWords(routine, me)} · last changed it</span>
      {children}
    </div>
  )
}
