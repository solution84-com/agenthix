import { useEffect, useState, type FormEvent } from 'react'
import { useAction, createBillingProfile, renameBillingProfile, archiveBillingProfile } from 'wasp/client/operations'
import { BILLING_PROFILE_NAME_MAX } from '@agenthix/core'
import { Button, FormField, Input, Modal, NativeSelect } from '@agenthix/ui/primitives'
import type { BillingProfileListItem } from '../reads'

const fail = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

function useSubmit(done: () => void, fallback: string) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try { await work(); done() } catch (err) { setError(fail(err, fallback)) } finally { setBusy(false) }
  }
  return { error, busy, run, clear: () => setError('') }
}

/** A new billing profile, with the projects to bill to it now (optional; each shows the profile it has now). */
export function NewProfileDialog({ open, profiles, onClose }: { open: boolean; profiles: BillingProfileListItem[]; onClose: () => void }) {
  const create = useAction(createBillingProfile)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const s = useSubmit(onClose, 'Could not make the billing profile')
  useEffect(() => { if (open) { setName(''); setPicked([]); s.clear() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const projects = profiles.filter(p => !p.archivedAt).flatMap(p => p.projects.map(pr => ({ ...pr, now: p.name })))

  const submit = (e: FormEvent) => { e.preventDefault(); void s.run(() => create({ name: name.trim(), projectIds: picked })) }
  return (
    <Modal open={open} onClose={onClose} title="New billing profile">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Name" htmlFor="bp-name" hint="Shown on cost reports, and to Agenthix Cloud on your bill's lines." error={s.error}>
          <Input id="bp-name" value={name} maxLength={BILLING_PROFILE_NAME_MAX} onChange={e => setName(e.target.value)} required autoFocus />
        </FormField>
        {projects.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-small font-medium text-text-secondary">Projects to bill to it now <span className="font-normal text-text-muted">· optional</span></legend>
            {projects.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-body text-text-primary">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={e => setPicked(cur => (e.target.checked ? [...cur, p.id] : cur.filter(x => x !== p.id)))} />
                {p.name} <span className="text-small text-text-muted">· now {p.now}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={s.busy || !name.trim()}>{s.busy ? 'Creating…' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function RenameProfileDialog({ profile, onClose }: { profile: BillingProfileListItem; onClose: () => void }) {
  const rename = useAction(renameBillingProfile)
  const [name, setName] = useState(profile.name)
  const s = useSubmit(onClose, 'Could not rename')
  const submit = (e: FormEvent) => { e.preventDefault(); void s.run(() => rename({ id: profile.id, name: name.trim() })) }
  return (
    <Modal open onClose={onClose} title={`Rename ${profile.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Name" htmlFor="bp-rename" error={s.error}>
          <Input id="bp-rename" value={name} maxLength={BILLING_PROFILE_NAME_MAX} onChange={e => setName(e.target.value)} required autoFocus />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={s.busy || !name.trim() || name.trim() === profile.name}>{s.busy ? 'Saving…' : 'Rename'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Archiving asks where the profile's projects go first; the costs so far stay on it. */
export function ArchiveProfileDialog({ profile, others, onClose }: { profile: BillingProfileListItem; others: BillingProfileListItem[]; onClose: () => void }) {
  const archive = useAction(archiveBillingProfile)
  const targets = others.filter(o => o.id !== profile.id && !o.archivedAt)
  const [to, setTo] = useState((targets.find(t => t.isDefault) ?? targets[0])?.id ?? '')
  const s = useSubmit(onClose, 'Could not archive')
  const n = profile.projectCount
  const submit = (e: FormEvent) => { e.preventDefault(); void s.run(() => archive({ id: profile.id, ...(n > 0 ? { moveProjectsTo: to } : {}) })) }
  return (
    <Modal open onClose={onClose} title={`Archive ${profile.name}?`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-body text-text-secondary">
          {n > 0 && `Its ${n === 1 ? 'project moves' : `${n} projects move`} to another billing profile from their next call. `}
          Its costs so far stay on it, and it stays on reports for the months it was used.
        </p>
        {n > 0 && (
          <FormField label="Move its projects to" htmlFor="bp-move" error={s.error}>
            <NativeSelect id="bp-move" value={to} onChange={e => setTo(e.target.value)}>
              {targets.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
            </NativeSelect>
          </FormField>
        )}
        {n === 0 && s.error && <p role="alert" className="text-small text-danger">{s.error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={s.busy || (n > 0 && !to)}>{s.busy ? 'Archiving…' : 'Archive'}</Button>
        </div>
      </form>
    </Modal>
  )
}
