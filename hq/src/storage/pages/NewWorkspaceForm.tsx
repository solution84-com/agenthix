import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAction, useQuery, createWorkspace, getRepoState } from 'wasp/client/operations'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY, FilesViewHeader } from '@agenthix/ui/projects'
import { ConnectRepoFlow } from '../../github/connect/ConnectRepoFlow'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import type { Owner } from './filesToolData'
import { FIELD as FIELD_LOOK, CARD_CHOSEN, CARD_CLICKABLE } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

const FIELD = `w-full rounded-lg px-3 py-2 text-body ${FIELD_LOOK}`

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
  const noSite = useNoExecutionSite()
  // Starting from a repository connects one, which is a project administrator's; an answer without the flag leaves it to the server.
  const mayConnect = useQuery(getRepoState, { target: owner }).data?.mayAdminister !== false
  const [name, setName] = useState('')
  const [from, setFrom] = useState<'repository' | 'empty'>('empty')
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)

  const ready = name.trim() && !noSite && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true); setError('')
    let id = createdId
    try {
      if (!id) {
        id = (await create({ name: name.trim(), ...owner })).workspaceId
        setCreatedId(id)
      }
      if (from === 'empty') onCreated(id)
    } catch (e: unknown) {
      setError(pressFailureWords(e, 'Could not create the workspace'))
    } finally {
      setBusy(false)
    }
  }

  if (createdId && from === 'repository' && !error) {
    return (
      <div>
        <FilesViewHeader back="Workspaces" onBack={() => onCreated(createdId)} title={`Connect ${name.trim()} to GitHub`} />
        <div className="space-y-4 px-4 py-4">
          <p className="text-small text-text-secondary">The workspace is created. Connect its repository now, or later from its About.</p>
          <ConnectRepoFlow target={{ ...owner, workspaceId: createdId }} defaultName={name.trim()} onConnected={() => setConnected(true)} onCancel={() => onCreated(createdId)} />
          {connected && <button type="button" className={FILES_BUTTON_PRIMARY} onClick={() => onCreated(createdId)}>Open the workspace</button>}
        </div>
      </div>
    )
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
            {([['repository', 'A GitHub repository', 'Connect a new or existing one next'], ['empty', 'Empty', 'Connect a repository later']] as const).filter(([value]) => value !== 'repository' || mayConnect).map(([value, title, hint]) => (
              <label key={value} className={`cursor-pointer rounded-lg border bg-card p-3 ${from === value ? CARD_CHOSEN : CARD_CLICKABLE}`}>
                <input type="radio" name="start-from" value={value} checked={from === value} onChange={() => setFrom(value)} className="sr-only" />
                <span className="block text-small font-medium text-text-primary">{title}</span>
                <span className="block text-micro text-text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <span className="mb-1 block text-small font-medium text-text-secondary">Site</span>
          <p className="text-small text-text-primary">{siteLabel ?? 'None yet'} <span className="text-text-muted">— where this place's files are</span></p>
        </div>
        {error && (
          <ShowAttention kind="alert" text={<>{error}{createdId && ' The workspace was created.'}</>}
            actions={createdId ? [{ label: 'Open it', variant: 'primary', onClick: () => onCreated(createdId) }] : undefined} />
        )}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={!ready} className={FILES_BUTTON_PRIMARY}>
            {busy && <Loader2 size={12} className="animate-spin" aria-hidden />} {from === 'repository' ? 'Create and connect a repository' : 'Create'}
          </button>
          <button type="button" onClick={onBack} className={FILES_BUTTON}>Cancel</button>
        </div>
        <p className="text-small text-text-muted">Or ask in the conversation: “set up a docs site in a new workspace”.</p>
      </div>
    </form>
  )
}
