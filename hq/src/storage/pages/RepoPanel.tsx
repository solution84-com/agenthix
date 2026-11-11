import { useState } from 'react'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, useAction } from 'wasp/client/operations'
import { getRepoState, disconnectRepo, getGithubAppStatus } from 'wasp/client/operations'
import { Loader2, Unlink } from 'lucide-react'
import { ConnectRepoFlow } from '../../github/connect/ConnectRepoFlow'
import type { Target as ExplorerTarget } from './filesToolData'
import { ShowAttention } from '@agenthix/ui/attention'
import { ReadNudge, siteReadRetry, useSiteRead } from '../../shared/siteRead'

// Reusable GitHub panel over any storage target (a workspace or an owner's files): the connect flow (G2) when nothing
// is connected, and the repository with Disconnect when it is.
export function RepoPanel({ target, repoName }: { target: ExplorerTarget; repoName?: string }) {
  // The read's failure and `isLoading` are both read, and neither is cosmetic. The repository state is read
  // from the Execution Site that holds this location, so a site that is down or refuses makes the query FAIL.
  // Left undestructured, `state` was simply `undefined` and this panel rendered as a confident "empty, unconnected
  // location", which is an invitation to create a second repository for a location that may already have one.
  // Nothing here may be actionable while the truth is unknown.
  const stateQuery = useQuery(getRepoState, { target }, { retry: siteReadRetry })
  const { data: state, isLoading: stateLoading } = stateQuery
  const stateRead = useSiteRead(stateQuery, { what: "This location's repository state" })
  const { data: appStatus } = useQuery(getGithubAppStatus)
  const appRegistered = appStatus === undefined ? true : appStatus.registered
  const disconnect = useAction(disconnectRepo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set the moment a connection succeeds, so the starter workflows stay on screen after the state reads "connected".
  const [connectedHere, setConnectedHere] = useState(false)

  // Connecting is unavailable until the state can be read: a repository may already be attached.
  if (stateRead.failedWithoutData) {
    return (
      <section className="space-y-3">
        <Heading />
        <ReadNudge read={stateRead} />
        <p className="text-small text-text-secondary">Connecting is unavailable until it can be read — a repository may already be attached, and connecting another would create a second one.</p>
      </section>
    )
  }

  const mayAdminister = state?.mayAdminister !== false

  if (state?.repoUrl && !connectedHere) {
    return (
      <section className="space-y-3">
        <Heading />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-micro font-medium bg-success/15 text-success">Connected</span>
          {mayAdminister && <button onClick={async () => { setBusy(true); setError(null); try { await disconnect({ target }) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) } }} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-micro font-medium text-text-muted not-disabled:hover:text-danger border border-border not-disabled:hover:border-danger/30 rounded-lg transition-all">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} Disconnect
          </button>}
        </div>
        <a href={state.repoUrl} target="_blank" rel="noopener noreferrer" className={`block text-micro text-link font-mono break-all hover:underline rounded-xl bg-surface-1 border border-border-subtle p-3 ${FOCUS_RING}`}>{state.repoUrl}</a>
        {error && <ShowAttention kind="alert" text={error} />}
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <Heading />
      {stateLoading && <p className="text-small text-text-muted">Reading this location's repository state…</p>}
      {(!mayAdminister || !appRegistered) && (
        <Button
          refusal={!mayAdminister
            ? { reason: 'Only a project administrator can connect a repository here.' }
            : { reason: 'No GitHub App is connected.', detail: <>No GitHub App connected. Register one under <span className="font-medium">Manage organisation › Settings › GitHub</span> first, then connect a repository here.</> }}
        >
          Connect repository
        </Button>
      )}
      {mayAdminister && appRegistered && !stateLoading && state && (
        <div className="rounded-xl bg-surface-1 border border-border-subtle p-4">
          <ConnectRepoFlow target={target} defaultName={repoName ?? ''} hasFiles={state.hasFiles} onConnected={() => setConnectedHere(true)} />
        </div>
      )}
    </section>
  )
}

function Heading() {
  return (
    <div>
      <h3 className="text-h3 font-medium text-text-primary">Repository</h3>
      <p className="text-small text-text-muted">Connect a GitHub repository: back up these files to a new one, or check out an existing one. Agents work on it through approved workflows.</p>
    </div>
  )
}
