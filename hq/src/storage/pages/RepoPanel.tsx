import { useState } from 'react'
import { useQuery, useAction } from 'wasp/client/operations'
import { getRepoState, disconnectRepo, getGithubAppStatus } from 'wasp/client/operations'
import { Loader2, Unlink } from 'lucide-react'
import { ConnectRepoFlow } from '../../github/connect/ConnectRepoFlow'
import type { Target as ExplorerTarget } from './filesToolData'

// Reusable GitHub panel over any storage target (a workspace or an owner's files): the connect flow (G2) when nothing
// is connected, and the repository with Disconnect when it is.
export function RepoPanel({ target, repoName }: { target: ExplorerTarget; repoName?: string }) {
  // `stateError` and `isLoading` are both destructured, and neither is cosmetic. The repository state is read
  // from the Execution Site that holds this location, so a site that is down or refuses makes the query FAIL.
  // Left undestructured, `state` was simply `undefined` and this panel rendered as a confident "empty, unconnected
  // location", which is an invitation to create a second repository for a location that may already have one.
  // Nothing here may be actionable while the truth is unknown.
  const { data: state, error: stateError, isLoading: stateLoading } = useQuery(getRepoState, { target })
  const { data: appStatus } = useQuery(getGithubAppStatus)
  const appRegistered = appStatus === undefined ? true : appStatus.registered
  const disconnect = useAction(disconnectRepo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set the moment a connection succeeds, so the starter workflows stay on screen after the state reads "connected".
  const [connectedHere, setConnectedHere] = useState(false)

  if (stateError) {
    return (
      <section className="space-y-3">
        <Heading />
        <div className="rounded-xl bg-danger/[0.06] border border-danger/20 p-4 space-y-1.5">
          <p className="text-small font-semibold text-danger">This location's repository state could not be read.</p>
          <p className="text-small text-danger/70">
            {stateError instanceof Error ? stateError.message : 'The Execution Site did not answer.'}
          </p>
          <p className="text-small text-text-muted">
            Connecting is unavailable until it can be read — a repository may already be attached, and connecting
            another would create a second one.
          </p>
        </div>
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
          {mayAdminister && <button onClick={async () => { setBusy(true); setError(null); try { await disconnect({ target }) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) } }} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-micro font-medium text-text-muted hover:text-danger border border-border hover:border-danger/30 rounded-lg transition-all">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} Disconnect
          </button>}
        </div>
        <a href={state.repoUrl} target="_blank" rel="noopener noreferrer" className="block text-micro text-accent/70 font-mono break-all hover:text-accent rounded-xl bg-surface-1 border border-border-subtle p-3">{state.repoUrl}</a>
        {error && <p className="text-small text-danger">{error}</p>}
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <Heading />
      {stateLoading && <p className="text-small text-text-muted">Reading this location's repository state…</p>}
      {mayAdminister && !appRegistered && (
        <div className="rounded-xl bg-warning/[0.06] border border-warning/15 p-4 text-small text-warning/80">
          No GitHub App connected. Register one under <span className="font-semibold">Manage organisation › Settings › GitHub</span> first, then connect a repository here.
        </div>
      )}
      {!mayAdminister && <p className="text-small text-text-muted">Only a project administrator can connect a repository here.</p>}
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
      <h3 className="text-h3 font-semibold text-text-primary">Repository</h3>
      <p className="text-small text-text-muted">Connect a GitHub repository: back up these files to a new one, or check out an existing one. Agents work on it through approved workflows.</p>
    </div>
  )
}
