import { useState } from 'react'
import { useQuery, useAction, getProjects, createInvite } from 'wasp/client/operations'
import { Modal, Button, Input } from '@agenthix/ui/primitives'
import type { OrgRole } from './peopleFormat'
import { RoleChoices } from './RoleChoices'
import { InviteProjects, type ProjectChoice } from './InviteProjects'
import { BRANDING } from '@agenthix/core'
import { COPY_FAILED_WORDS } from '../../../shared/copyText'
import { useCopy } from '../../../shared/hooks/useCopy'
import { useAttentionWhen } from '@agenthix/ui/attention'

export type CreatedInvite = { id: string; link: string }

const LABEL = 'mb-1 block text-small text-text-muted'

export function InviteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (i: CreatedInvite) => void }) {
  const { data } = useQuery(getProjects)
  const create = useAction(createInvite)
  const [forWhom, setForWhom] = useState('')
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ link: string; worksOnlyHere: boolean } | null>(null)
  const copier = useCopy()
  const copyDialog = useAttentionWhen(copier.state === 'failed' ? COPY_FAILED_WORDS : null, { title: 'Not copied' })
  const projects: ProjectChoice[] = (data ?? []).filter(p => !p.personalOwnerId)

  function close() {
    setForWhom(''); setRole('MEMBER'); setProjectIds([]); setError(null); setMade(null)
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await create({ role, note: forWhom.trim() || undefined, projectIds })
      setMade({ link: created.link, worksOnlyHere: created.addressWorksOnlyHere })
      onCreated({ id: created.id, link: created.link })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (made) await copier.copy(made.link)
  }

  const isMade = made !== null
  return (
    <Modal open={open} onClose={close} title="Invite someone" maxWidth="max-w-xl">
      <p className="-mt-1 mb-4 text-small text-text-secondary">A link for one person, good for 7 days</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="invite-for" className={LABEL}>Who it's for</label>
          <Input id="invite-for" value={forWhom} disabled={isMade} onChange={e => setForWhom(e.target.value)} placeholder="A name, so you can tell invitations apart" />
        </div>
        <div>
          <span className={LABEL}>Organisation role</span>
          <RoleChoices label="Organisation role" value={role} onChange={setRole} disabled={isMade} />
        </div>
        {(projects.length > 0 || isMade) && (
          <div>
            <span className={LABEL}>Projects they join on accepting <span className="text-text-muted">· optional</span></span>
            {isMade
              ? <p className="text-small text-text-secondary">{projectIds.length === 0 ? 'None' : projectIds.map(id => projects.find(p => p.id === id)?.name).filter(Boolean).join(', ')}</p>
              : <InviteProjects projects={projects} chosen={projectIds} onChange={setProjectIds} />}
          </div>
        )}
        {errorDialog}
        {!isMade && (
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create link'}</Button>
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          </div>
        )}
      </form>
      {made && (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted">Then</h3>
          <div className="select-all break-all rounded-lg border border-field-border bg-field px-3 py-2 font-mono text-small text-text-secondary">{made.link}</div>
          {made.worksOnlyHere && (
            <p role="status" className="mt-1.5 rounded-lg border border-warning/60 px-3 py-2 text-small text-text-secondary">
              <b className="font-medium text-text-primary">This link works only on this computer.</b> Set HQ's address in Infrastructure › HQ.
            </p>
          )}
          <p className="mt-1.5 text-small text-text-muted">
            Copy it and send it yourself: {BRANDING.displayName} sends no email. It works once, and is not shown again; if it is lost, revoke the invitation and make another.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void copy()}>{copier.state === 'copied' ? 'Copied' : 'Copy link'}</Button>
            <Button variant="secondary" onClick={close}>Done</Button>
          </div>
          {copyDialog}
        </div>
      )}
    </Modal>
  )
}
