import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQuery, useAction, connectRepo, getProjectGitHubAccounts, getMyGitHubAccounts } from 'wasp/client/operations'
import { Button, NativeSelect, FIELD, CARD_CHOSEN, FOCUS_RING } from '@agenthix/ui/primitives'
import { repoName } from '../../storage/pages/BackupLine'
import { StartersPanel, type ProposedStarter } from './StartersPanel'
import { useConnectCheck, type ConnectKind } from './useConnectCheck'
import { ShowAttention } from '@agenthix/ui/attention'

type Target = { ownerType: 'user' | 'project'; ownerId: string; workspaceId?: string }

const CARD = 'block cursor-pointer rounded-lg border p-3'

/**
 * Connecting a repository (workflows spec part 5, G2), the same from a workspace, from Files and from a new workspace:
 * new or existing, the account (starting at the project's default), the name checked as it is typed, and the starter
 * workflows waiting once it is connected. Everything that can be checked is checked before anything is created.
 */
export function ConnectRepoFlow({ target, defaultName, initialKind = 'new', hasFiles = false, siteReady = true, onConnected, onCancel }: {
  target: Target
  defaultName: string
  initialKind?: ConnectKind
  hasFiles?: boolean
  siteReady?: boolean
  onConnected?: () => void
  onCancel?: () => void
}) {
  const connect = useAction(connectRepo)
  const isProject = target.ownerType === 'project'
  const { data: projectAccounts } = useQuery(getProjectGitHubAccounts, isProject ? { projectId: target.ownerId } : undefined, { enabled: isProject })
  const { data: myAccounts } = useQuery(getMyGitHubAccounts, undefined, { enabled: !isProject })
  const accounts = isProject ? projectAccounts : myAccounts
  const [kind, setKind] = useState<ConnectKind>(initialKind)
  const [name, setName] = useState(defaultName)
  const [address, setAddress] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ repoUrl: string; proposed: ProposedStarter[]; problem: string | null } | null>(null)

  const only = accounts?.accounts.length === 1 ? accounts.accounts[0].id : undefined
  const accountId = chosen ?? accounts?.defaultId ?? only
  const text = kind === 'new' ? name : address
  const { answer, checking, failure } = useConnectCheck(target, kind, text, accountId)
  useEffect(() => { setError(null) }, [kind])

  if (done) {
    return <StartersPanel place={{ type: target.ownerType, id: target.ownerId }} proposed={done.proposed} problem={done.problem} repoLabel={`Connected to ${repoName(done.repoUrl)}`} />
  }

  const ready = siteReady && !busy && !checking && !!text.trim() && answer?.ok === true
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await connect({ target, mode: kind === 'new' ? 'init' : 'existing', ...(kind === 'new' ? { name: name.trim() } : { repoUrl: address.trim() }), installationId: accountId })
      setDone({ repoUrl: r.repoUrl, proposed: r.starters.proposed as ProposedStarter[], problem: r.starters.problem })
      onConnected?.()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const login = answer?.account?.login

  return (
    <form className="space-y-4" aria-label="Connect to GitHub" onSubmit={(e) => { e.preventDefault(); if (ready) void submit() }} data-testid="connect-flow">
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">New or existing</legend>
        <label className={`${CARD} ${kind === 'new' ? CARD_CHOSEN : 'border-border hover:border-border-strong'}`}>
          <input type="radio" name="connect-kind" className="accent-accent sr-only" checked={kind === 'new'} onChange={() => setKind('new')} />
          <span className="block text-small font-medium text-text-primary">A new repository</span>
          <span className="block text-micro text-text-muted">Created private, with this workspace's files pushed to it</span>
        </label>
        <label className={`${CARD} ${kind === 'existing' ? CARD_CHOSEN : 'border-border hover:border-border-strong'}`}>
          <input type="radio" name="connect-kind" className="accent-accent sr-only" checked={kind === 'existing'} onChange={() => setKind('existing')} />
          <span className="block text-small font-medium text-text-primary">An existing repository</span>
          <span className="block text-micro text-text-muted">
            {hasFiles ? "This workspace has files: they're pushed to it if it's empty or shares their history." : "This workspace is empty, so the repository is checked out into it. (With files, they're pushed to it if it's empty or shares their history.)"}
          </span>
        </label>
      </fieldset>

      {accounts && (
        <label className="block">
          <span className="mb-1 block text-small font-medium text-text-secondary">GitHub account</span>
          <NativeSelect value={accountId ?? ''} onChange={(e) => setChosen(e.target.value)} className="max-w-xs" aria-label="GitHub account">
            {!accountId && <option value="">Choose an account</option>}
            {accounts.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.login}{a.id === accounts.defaultId ? ' · the project\'s default' : ''}{a.reach.canCreateRepository ? '' : ' · links only'}
              </option>
            ))}
          </NativeSelect>
          <span className="mt-1 block text-micro text-text-muted">{isProject ? "Starts at the project's default; accounts this project can't connect to aren't listed." : 'Only the accounts an organisation administrator chose you for are listed.'}</span>
        </label>
      )}

      {kind === 'new' ? (
        <label className="block">
          <span className="mb-1 block text-small font-medium text-text-secondary">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full rounded-lg ${FIELD} px-3 py-2 font-mono text-body`} placeholder="docs-site" />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-small font-medium text-text-secondary">Repository address</span>
          <input type="url" value={address} onChange={(e) => setAddress(e.target.value)} className={`w-full rounded-lg ${FIELD} px-3 py-2 font-mono text-body`} placeholder="https://github.com/org/repo" />
        </label>
      )}

      <div aria-live="polite" className="text-small" data-testid="connect-check">
        {checking && <span className="flex items-center gap-1.5 text-text-muted"><Loader2 size={12} className="animate-spin" aria-hidden /> Checking…</span>}
        {!checking && failure && <span className="text-danger">{failure}</span>}
        {!checking && answer?.ok && <span className="text-success">{kind === 'new' ? `✓ Free on ${login}` : `✓ HQ can reach it in ${login}`}</span>}
        {!checking && answer && !answer.ok && answer.problem && (
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-text-secondary">
            <p>{answer.problem.words}</p>
            {answer.useExisting && <Button type="button" variant="secondary" size="sm" onClick={() => { setAddress(answer.useExisting!.repoUrl); setKind('existing') }}>Use the existing one</Button>}
            {kind === 'new' && ['selected_repositories', 'personal_account', 'no_administration'].includes(answer.problem.kind) && (
              <button type="button" className={`rounded block text-link hover:underline ${FOCUS_RING}`} onClick={() => setKind('existing')}>Connect an existing repository instead</button>
            )}
          </div>
        )}
      </div>

      <ShowAttention text={error} title="The repository was not connected" onClose={() => setError(null)} />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!ready} refusal={accounts && accounts.accounts.length === 0 ? { reason: isProject ? 'No GitHub account is allowed for this project yet.' : 'No GitHub account is allowed for your own work yet.', title: 'No GitHub account to use', detail: `${isProject ? 'No GitHub account is allowed for this project yet.' : 'No GitHub account is allowed for your own work yet.'} An organisation administrator allows one under Manage organisation › Settings › GitHub.` } : undefined}>
          {busy && <Loader2 size={12} className="animate-spin" aria-hidden />} {kind === 'new' ? 'Create and connect' : 'Connect'}
        </Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}
