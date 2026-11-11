import { useId, useState } from 'react'
import { useAction, useQuery, getProjects, getTaskTemplateInstallPlan, installTaskTemplateInProject } from 'wasp/client/operations'
import { Check, Lock } from 'lucide-react'
import { Button, Modal, NativeSelect } from '@agenthix/ui/primitives'
import type { TaskTemplateContent } from '@agenthix/core'
import { refusalText } from '../../shared/refusal'
import { addButtonWords, keptFieldNote, keptFieldWhy, keptTypeNote, nothingToAddWhy, ownCopyWords } from '../taskTemplates/installWords'
import { TemplateFieldLine, TemplateTypeLine } from './TaskTemplateHolds'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

type Listed = { id: string; key: string; name: string; isMember: boolean; myRole: 'ADMIN' | 'MEMBER' | 'VIEWER' | null }

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/**
 * Add a task template to a project (spec D16, TM1): pick a project where the person may change the task types, then
 * read what it adds and what it leaves alone because the project already has one of that name, before anything changes.
 * The button says how many types and fields it adds. Added, the project's Task types shows the result; no message.
 */
export function AddToProjectDialog({ assetId, title, holds, initialProjectId, onClose, onAdded }: {
  assetId: string
  title: string
  holds: TaskTemplateContent
  initialProjectId?: string | null
  onClose: () => void
  onAdded: (projectKey: string) => void
}) {
  const selectId = useId()
  const { data: listed } = useQuery(getProjects)
  const projects = ((listed ?? []) as Listed[]).filter(p => p.isMember && p.myRole !== 'VIEWER')
  const [chosen, setChosen] = useState<string | null>(initialProjectId ?? null)
  const projectId = chosen && projects.some(p => p.id === chosen) ? chosen : projects[0]?.id ?? null
  const project = projects.find(p => p.id === projectId)
  const { data: plan, error, refetch } = useQuery(getTaskTemplateInstallPlan, projectId ? { assetId, projectId } : undefined, { enabled: !!projectId })
  const install = useAction(installTaskTemplateInProject)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  const ready = plan && plan.project.id === projectId ? plan : null
  const label = ready ? addButtonWords(ready) : null
  const add = () => {
    if (!ready || !project || !label) return
    setBusy(true)
    setRefused(null)
    install({ assetId, projectId: ready.project.id, versionId: ready.versionId, types: ready.adds.types.map(t => t.name), fields: ready.adds.fields.map(f => f.name) })
      .then(() => onAdded(project.key), err => { setRefused(refusalText(err)); setBusy(false) })
  }
  const kept = ready ? ready.keeps.types.length + ready.keeps.fields.length : 0

  return (
    <Modal open onClose={onClose} title={`Add ${title} to a project`} maxWidth="max-w-xl">
      <div className="space-y-5">
        <div>
          <label htmlFor={selectId} className="mb-1.5 block text-small text-text-secondary">Project</label>
          {listed && projects.length === 0 ? (
            <p className="text-body text-text-secondary">You don't work in any project where you may change the task types.</p>
          ) : (
            <NativeSelect id={selectId} value={projectId ?? ''} onChange={e => { setChosen(e.target.value); setRefused(null) }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          )}
          <p className="mt-1.5 text-micro text-text-muted">Only projects where you may change the task types.</p>
        </div>
        {error && <ReadFailure what="The preview" retry={() => void refetch()} />}
        {ready && (
          <>
            <section aria-label="It adds" className="space-y-2">
              <h3 className={HEADING}>It adds{label ? ` · ${label.replace(/^Add /, '')}` : ''}</h3>
              {!label && <p className="text-body text-text-secondary">Nothing: {ready.project.name} already has every type and field in it.</p>}
              {ready.adds.types.map(t => (
                <div key={t.name} className="flex gap-2"><Check size={14} aria-hidden className="mt-1.5 shrink-0 text-success" />
                  <TemplateTypeLine type={t} note={`Type · ${t.columns.length} columns, in the state shown above each`} /></div>
              ))}
              {ready.adds.fields.map(f => (
                <div key={f.name} className="flex gap-2"><Check size={14} aria-hidden className="mt-1 shrink-0 text-success" />
                  <TemplateFieldLine field={f} note={`Field · single select · ${f.options.length} options`} /></div>
              ))}
            </section>
            <section aria-label="Left alone" className="space-y-2">
              <h3 className={HEADING}>Left alone{kept ? ` · ${[ready.keeps.types.length ? `${ready.keeps.types.length} ${ready.keeps.types.length === 1 ? 'type' : 'types'}` : '', ready.keeps.fields.length ? `${ready.keeps.fields.length} ${ready.keeps.fields.length === 1 ? 'field' : 'fields'}` : ''].filter(Boolean).join(' and ')}` : ''}</h3>
              {kept === 0 && <p className="text-body text-text-secondary">Nothing: {ready.project.name} has no type or field with these names.</p>}
              {ready.keeps.types.map(k => (
                <div key={k.name} className="flex gap-2"><Lock size={14} aria-hidden className="mt-1 shrink-0 text-text-muted" />
                  <p className="text-body text-text-primary"><span className="font-medium">{k.name}</span> <span className="text-small text-text-muted">{keptTypeNote(k, ready.project.name)}</span></p></div>
              ))}
              {ready.keeps.fields.map(k => (
                <div key={k.name} className="flex gap-2"><Lock size={14} aria-hidden className="mt-1 shrink-0 text-text-muted" />
                  <div><p className="text-body text-text-primary"><span className="font-medium">{k.name}</span> <span className="text-small text-text-muted">{keptFieldNote(k, ready.project.name)}</span></p>
                    <p className="text-small text-text-secondary">{keptFieldWhy(k, ready.project.name, holds)}</p></div></div>
              ))}
              {kept > 0 && <p className="text-micro text-text-muted">A type or field of the same name is never changed or merged.</p>}
            </section>
            <p className="text-small text-text-muted">{ownCopyWords(ready.project.name, title)}</p>
          </>
        )}
        <ShowAttention kind="alert" text={refused} title="It was not added" onClose={() => setRefused(null)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!label || busy} title={ready && !label ? nothingToAddWhy(ready) : undefined} onClick={add}>{label ?? 'Nothing to add'}</Button>
        </div>
      </div>
    </Modal>
  )
}
