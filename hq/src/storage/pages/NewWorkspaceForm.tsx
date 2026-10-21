import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAction, createWorkspace, connectRepo } from 'wasp/client/operations'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY, FilesViewHeader } from '@agenthix/ui/projects'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import type { Owner } from './filesToolData'

const FIELD = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none'

/**
 * A new workspace, in place in the Workspaces tool (spec §3): a name, then from a GitHub repository or empty. The
 * workspace's site is the place's own, named here rather than chosen.
 */
export function NewWorkspaceForm({ owner, siteLabel, onBack, onCreated }: {
  owner: Owner
  siteLabel: string | null
  onBack: () => void
  onCreated: (workspaceId: string) => void
}) {
  const create = useAction(createWorkspace)
  const link = useAction(connectRepo)
  const noSite = useNoExecutionSite()
  const [name, setName] = useState('')
  const [from, setFrom] = useState<'repository' | 'empty'>('empty')
  const [repoUrl, setRepoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)

  const ready = name.trim() && (from === 'empty' || repoUrl.trim()) && !noSite && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true); setError('')
    let id = createdId
    try {
      if (!id) {
        id = (await create({ name: name.trim(), ...owner })).workspaceId
        setCreatedId(id)
      }
      if (from === 'repository') await link({ target: { ...owner, workspaceId: id }, mode: 'link', repoUrl: repoUrl.trim() })
      onCreated(id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create the workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); void submit() }}>
      <FilesViewHeader back="Workspaces" onBack={onBack} title="New workspace" />
      <div className="space-y-4 px-4 py-4">
        <NoExecutionSiteNotice />
        <label className="block">
          <span className="mb-1 block text-small font-medium text-text-secondary">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="docs-site" autoFocus className={FIELD} />
        </label>
        <fieldset>
          <legend className="mb-1 text-small font-medium text-text-secondary">Start from</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['repository', 'A GitHub repository', 'Agents check it out and push to it'], ['empty', 'Empty', 'Connect a repository later']] as const).map(([value, title, hint]) => (
              <label key={value} className={`cursor-pointer rounded-lg border p-3 ${from === value ? 'border-accent bg-surface-2' : 'border-border bg-surface-1'}`}>
                <input type="radio" name="start-from" value={value} checked={from === value} onChange={() => setFrom(value)} className="sr-only" />
                <span className="block text-small font-semibold text-text-primary">{title}</span>
                <span className="block text-micro text-text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {from === 'repository' && (
          <label className="block">
            <span className="mb-1 block text-small font-medium text-text-secondary">Repository address</span>
            <input type="url" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className={`${FIELD} font-mono`} />
          </label>
        )}
        <div>
          <span className="mb-1 block text-small font-medium text-text-secondary">Site</span>
          <p className="text-small text-text-primary">{siteLabel ?? 'None yet'} <span className="text-text-muted">— where this place's files are</span></p>
        </div>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
            {createdId && <> The workspace was created. <button type="button" className="underline" onClick={() => onCreated(createdId)}>Open it</button></>}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!ready} className={FILES_BUTTON_PRIMARY}>
            {busy && <Loader2 size={12} className="animate-spin" aria-hidden />} Create
          </button>
          <button type="button" onClick={onBack} className={FILES_BUTTON}>Cancel</button>
        </div>
        <p className="text-small text-text-muted">Or ask in the conversation: “set up a docs site in a new workspace”.</p>
      </div>
    </form>
  )
}
