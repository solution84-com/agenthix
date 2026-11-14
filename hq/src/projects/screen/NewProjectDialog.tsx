import { useState } from 'react'
import { useNavigate } from 'react-router'
import { deriveProjectKey } from '@agenthix/core'
import { useAction, createPersonalProject, createProject } from 'wasp/client/operations'
import { Modal, FormField, Input, Textarea, Button, NativeSelect, CARD_CHOSEN, CARD_CLICKABLE } from '@agenthix/ui/primitives'
import { useAttention } from '../../shared/components/AttentionDialog'
import { pressFailureWords } from '../../shared/failureWords'

export type ProjectKind = 'personal' | 'organisation'

/** A site a project may be put on: not revoked. */
export interface NewProjectSite { siteId: string; label: string; isDefault: boolean }
export interface NewProjectBillingProfile { id: string; name: string; isDefault: boolean }

/**
 * Which of the form's choices are drawn. *Where it runs* only for an organisation project, and only when there is
 * more than one site; a personal project runs where the person's own space is kept. *AI cost billed to* only for an
 * organisation project, only with two or more billing profiles, and only to an organisation admin: who pays is
 * theirs once the project exists, so a member's project bills to the default.
 */
export function newProjectFields(o: { kind: ProjectKind; siteCount: number; profileCount: number; isOrgAdmin: boolean }) {
  const organisation = o.kind === 'organisation'
  return { site: organisation && o.siteCount > 1, billing: organisation && o.isOrgAdmin && o.profileCount >= 2 }
}

const KINDS: Array<{ kind: ProjectKind; label: string; hint: string }> = [
  { kind: 'personal', label: 'Just you', hint: 'Only you see it. Any agent can work in it for you.' },
  { kind: 'organisation', label: 'The organisation', hint: 'People you add can see it and work in it.' },
]

const siteName = (s: NewProjectSite) => (s.isDefault ? `${s.label} · HQ's site` : s.label)

/**
 * *New project*, one form for every member of the organisation: Name, Key (following the name until the person types
 * in it), Description, *Who is in it*, then *Where it runs* and *AI cost billed to* when there is a choice to make.
 * *Create project* makes it and opens its overview.
 */
export function NewProjectDialog({ open, onClose, isOrgAdmin, sites, billingProfiles, existingKeys }: {
  open: boolean
  onClose: () => void
  isOrgAdmin: boolean
  sites: NewProjectSite[]
  billingProfiles: NewProjectBillingProfile[]
  existingKeys: string[]
}) {
  const makePersonal = useAction(createPersonalProject)
  const makeShared = useAction(createProject)
  const navigate = useNavigate()
  const attention = useAttention()
  const [kind, setKind] = useState<ProjectKind>('organisation')
  const [name, setName] = useState('')
  const [typedKey, setTypedKey] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [siteId, setSiteId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [busy, setBusy] = useState(false)

  const shown = newProjectFields({ kind, siteCount: sites.length, profileCount: billingProfiles.length, isOrgAdmin })
  const derivedKey = name.trim() ? deriveProjectKey(name, existingKeys) : ''
  const key = typedKey ?? derivedKey
  const keyIsValid = key === '' || /^[A-Z]{2,6}$/.test(key)
  const chosenSite = siteId || (sites.find(s => s.isDefault) ?? sites[0])?.siteId || ''
  const chosenProfile = profileId || (billingProfiles.find(b => b.isDefault) ?? billingProfiles[0])?.id || ''

  const close = () => {
    setKind('organisation'); setName(''); setTypedKey(null); setDescription(''); setSiteId(''); setProfileId(''); setBusy(false)
    onClose()
  }

  const submit = async () => {
    setBusy(true)
    const common = {
      name: name.trim(),
      description: description.trim() || undefined,
      // Only a key the person typed is sent: with none, HQ derives one that is free.
      ...(typedKey ? { key: typedKey } : {}),
    }
    try {
      const made = kind === 'personal'
        ? await makePersonal(common)
        : await makeShared({
          ...common,
          ...(shown.site ? { siteId: chosenSite } : {}),
          ...(shown.billing ? { billingProfileId: chosenProfile } : {}),
        })
      close()
      navigate(`/projects/${(made as { key: string }).key}`)
    } catch (err) {
      setBusy(false)
      attention.show({ title: 'The project was not made', text: pressFailureWords(err, 'HQ did not make the project.'), retry: () => void submit() })
    }
  }

  return (
    <Modal open={open} onClose={close} title="New project">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim() && keyIsValid) void submit() }}>
        <FormField label="Name" htmlFor="new-project-name">
          <Input id="new-project-name" value={name} onChange={e => setName(e.target.value)} placeholder="Intranet refresh" autoFocus />
        </FormField>
        <FormField label="Key" htmlFor="new-project-key" hint={keyIsValid ? `Task numbers read ${key || 'KEY'}-1, ${key || 'KEY'}-2…` : 'Two to six letters.'}>
          <Input
            id="new-project-key" value={key} maxLength={6} className="font-mono"
            onChange={e => {
              const next = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6)
              setTypedKey(next === '' ? null : next)
            }}
          />
        </FormField>
        <FormField label="Description (optional)" htmlFor="new-project-description">
          <Textarea id="new-project-description" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this project is for" />
        </FormField>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-text-secondary">Who is in it</legend>
          <div className="space-y-2">
            {KINDS.map(k => (
              <label key={k.kind} className={`flex cursor-pointer gap-3 rounded-xl border bg-card p-3 ${CARD_CLICKABLE} ${kind === k.kind ? CARD_CHOSEN : ''}`}>
                <input type="radio" name="new-project-kind" value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} className="mt-1 accent-accent" />
                <span>
                  <span className="block text-body font-medium text-text-primary">{k.label}</span>
                  <span className="block text-small text-text-muted">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {shown.site && (
          <FormField label="Where it runs" htmlFor="new-project-site" hint="Its files are kept there and its agents run there. It can't be moved later.">
            <NativeSelect id="new-project-site" value={chosenSite} onChange={e => setSiteId(e.target.value)}>
              {sites.map(s => <option key={s.siteId} value={s.siteId}>{siteName(s)}</option>)}
            </NativeSelect>
          </FormField>
        )}
        {shown.billing && (
          <FormField label="AI cost billed to" htmlFor="new-project-billing" hint="Which billing profile its cost reports go to.">
            <NativeSelect id="new-project-billing" value={chosenProfile} onChange={e => setProfileId(e.target.value)}>
              {billingProfiles.map(b => <option key={b.id} value={b.id}>{b.name}{b.isDefault ? ' (default)' : ''}</option>)}
            </NativeSelect>
          </FormField>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim() || !keyIsValid}>{busy ? 'Creating…' : 'Create project'}</Button>
        </div>
      </form>
      {attention.dialog}
    </Modal>
  )
}
