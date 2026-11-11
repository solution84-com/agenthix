import { useState } from 'react'
import { addPlaceSecret, useAction } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { repoName } from '../../storage/pages/BackupLine'
import { nameProblem } from '../pages/secretsWords'
import type { SecretsPlace } from '../pages/secretsTypes'
import { ApproveGitHubSecretDialog } from './ApproveGitHubSecretDialog'
import { SecretValueFields, type SecretInput } from './SecretValueFields'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Add a secret (secrets spec part 3): name, what it is and what it reaches, who issues it, where to get a new one, the value, an
 * optional rotate-by date, and *Also set it on GitHub* where the place has a repository. Ticked, saving proposes the
 * secret's name to `set-github-secrets` and the approval follows at once (`ApproveGitHubSecretDialog`).
 */
export function AddSecretDialog({ open, onClose, place, repository, initialName = '' }: {
  open: boolean
  onClose: () => void
  place: SecretsPlace
  repository: { workspaceId: string; repoUrl: string } | null
  initialName?: string
}) {
  const add = useAction(addPlaceSecret)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const [issuer, setIssuer] = useState('')
  const [renewAt, setRenewAt] = useState('')
  const [rotateBy, setRotateBy] = useState('')
  const [value, setValue] = useState<SecretInput | null>(null)
  const [alsoOnGitHub, setAlsoOnGitHub] = useState(false)
  const [followUp, setFollowUp] = useState<{ number: number | null; message: string | null } | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const problems = { name: nameProblem(name), description: description.trim() ? null : 'Say what it is and what it reaches.', value: value ? null : 'Type the value or choose a file.' }
  const submit = async () => {
    setTried(true)
    if (problems.name || problems.description || problems.value) return
    setBusy(true)
    setError(null)
    try {
      const added = await add({ place, name, value: value!, description, issuer, renewAt, rotateBy: rotateBy || null, alsoOnGitHub })
      if (!alsoOnGitHub || !added.github) { onClose(); return }
      setFollowUp(added.github.proposed ? { number: added.github.version, message: null } : { number: null, message: added.github.message })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (followUp && repository) {
    return <ApproveGitHubSecretDialog place={place} name={name} workspaceId={repository.workspaceId} repoLabel={repoName(repository.repoUrl)} number={followUp.number} message={followUp.message} onClose={onClose} />
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a secret" maxWidth="max-w-lg">
      <form className="max-h-[70vh] space-y-4 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); void submit() }} data-testid="add-secret-dialog">
        <FormField label="Name" htmlFor="secret-name" hint="Capitals, digits and _. Say what it's for, not only whose it is." error={tried ? problems.name ?? undefined : undefined}>
          <Input id="secret-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="STAGING_DEPLOY_KEY" />
        </FormField>
        <FormField label="What it is and what it reaches" htmlFor="secret-description" error={tried ? problems.description ?? undefined : undefined}>
          <Input id="secret-description" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Who issues it" htmlFor="secret-issuer">
          <Input id="secret-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} autoComplete="off" placeholder="For example: the staging server" />
        </FormField>
        <FormField label="Where to get a new one" htmlFor="secret-renew">
          <Input id="secret-renew" value={renewAt} onChange={(e) => setRenewAt(e.target.value)} autoComplete="off" placeholder="For example: ssh-keygen on the server" />
        </FormField>
        <SecretValueFields name={name} onChange={setValue} error={tried ? problems.value ?? undefined : undefined} />
        <FormField label="Rotate by" htmlFor="secret-rotate" hint="Optional. The administrators are reminded a week before.">
          <Input id="secret-rotate" type="date" value={rotateBy} onChange={(e) => setRotateBy(e.target.value)} />
        </FormField>
        {repository && (
          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2 text-small font-medium text-text-secondary">
              <input className="accent-accent" type="checkbox" checked={alsoOnGitHub} onChange={(e) => setAlsoOnGitHub(e.target.checked)} aria-describedby="also-github-hint" />
              Also set it on GitHub, for GitHub workflows
            </label>
            <p id="also-github-hint" className="mt-1 text-small text-text-muted">
              In <b>{repoName(repository.repoUrl)}</b>, as <code>{name || 'its name'}</code>. Saving proposes adding it to <code>set-github-secrets</code>; you approve that next, and it runs.
            </p>
          </div>
        )}
        <ShowAttention text={error} title="The secret was not added" onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{alsoOnGitHub ? 'Save, then approve' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
