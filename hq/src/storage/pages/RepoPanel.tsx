import { useState } from 'react'
import { useQuery, useAction } from 'wasp/client/operations'
import { getRepoState, connectRepo, disconnectRepo, getGithubAppStatus } from 'wasp/client/operations'
import { GitBranch, Link2, Loader2, Unlink } from 'lucide-react'
import type { Target as ExplorerTarget } from './filesToolData'

// Reusable GitHub panel over any storage target (a workspace or an owner's files).
// State-driven: Init always; Link disabled when the location has files; Disconnect when connected.
export function RepoPanel({ target, repoName }: { target: ExplorerTarget; repoName?: string }) {
  // `stateError` and `isLoading` are both destructured, and neither is
  // cosmetic. The repository state is read from the Execution Site that holds
  // this location, so a site that is down or refuses makes the query FAIL. Left
  // undestructured, `state` was simply `undefined` and this panel rendered as a
  // confident "empty, unconnected location" — offering Back up and Link, which
  // is an invitation to create a second repository for a location that may
  // already have one. Nothing here may be actionable while the truth is
  // unknown.
  const { data: state, error: stateError, isLoading: stateLoading } = useQuery(getRepoState, { target })
  const { data: appStatus } = useQuery(getGithubAppStatus)
  // Optimistic while loading (avoids a flash of the warning); accurate once resolved.
  const appRegistered = appStatus === undefined ? true : appStatus.registered
  const canCreate = appStatus === undefined ? true : (appStatus.registered ? appStatus.canCreateRepos : false)
  const connect = useAction(connectRepo)
  const disconnect = useAction(disconnectRepo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'link'>('idle')
  const [linkUrl, setLinkUrl] = useState('')
  const [repoNameInput, setRepoNameInput] = useState(repoName ?? '')
  const [collision, setCollision] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  // Back up = create a new repo + push. On a name collision, surface the Consolidate (adopt) choice.
  const backUp = async () => {
    setBusy(true); setError(null); setCollision(false)
    try {
      await connect({ target, mode: 'init', name: repoNameInput.trim() || undefined })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (/already exists/i.test(msg)) setCollision(true)
      else setError(msg)
    } finally { setBusy(false) }
  }
  // Adopt = push our files to the existing repo of that name (git-safe; rejected on divergence).
  const adopt = () => run(() => connect({ target, mode: 'adopt', name: repoNameInput.trim() || undefined }))

  const stateUnknown = stateError != null || state === undefined
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

  if (state?.repoUrl) {
    return (
      <section className="space-y-3">
        <Heading />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-micro font-medium bg-success/15 text-success">Connected</span>
          <button onClick={() => run(() => disconnect({ target }))} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-micro font-medium text-text-muted hover:text-danger border border-border hover:border-danger/30 rounded-lg transition-all">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} Disconnect
          </button>
        </div>
        <a href={state.repoUrl} target="_blank" rel="noopener noreferrer" className="block text-micro text-accent/70 font-mono break-all hover:text-accent rounded-xl bg-surface-1 border border-border-subtle p-3">{state.repoUrl}</a>
        {error && <p className="text-small text-danger">{error}</p>}
      </section>
    )
  }

  // While the state is still loading, the location's emptiness is not known
  // either — so Link stays disabled rather than assuming an empty location.
  const hasFiles = state?.hasFiles ?? false
  const actionsDisabled = busy || stateUnknown
  return (
    <section className="space-y-3">
      <Heading />
      {error && <p className="text-small text-danger">{error}</p>}
      {stateLoading && <p className="text-small text-text-muted">Reading this location's repository state…</p>}
      {!appRegistered && (
        <div className="rounded-xl bg-warning/[0.06] border border-warning/15 p-4 text-small text-warning/80">
          No GitHub App connected. Register one under <span className="font-semibold">Organisation › Infrastructure › GitHub App</span> first, then back up or link a repo here.
        </div>
      )}
      {appRegistered && (
      <div className="rounded-xl bg-surface-1 border border-border-subtle p-4 space-y-2.5">
        <div className="text-body font-semibold text-text-secondary">Back up to GitHub</div>
        <div className="text-small text-text-muted">Creates a private repo named below and pushes this location's files up to it.</div>
        {canCreate ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-3 py-2 focus-within:ring-1 focus-within:ring-accent">
              <span className="text-small text-text-muted font-mono shrink-0">repo name</span>
              <input
                type="text"
                value={repoNameInput}
                onChange={e => { setRepoNameInput(e.target.value); setCollision(false) }}
                placeholder="my-repo"
                className="flex-1 bg-transparent text-body text-text-primary font-mono placeholder:text-text-muted focus:outline-none"
              />
            </div>
            {!collision ? (
              <button onClick={backUp} disabled={actionsDisabled} className="flex items-center gap-2 px-4 py-2 text-body font-medium bg-accent hover:bg-accent-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors">
                {busy ? <><Loader2 size={14} className="animate-spin" /> Working…</> : <><GitBranch size={14} /> Back up to GitHub</>}
              </button>
            ) : (
              <div className="rounded-lg bg-warning/[0.06] border border-warning/15 p-3.5 space-y-3">
                <p className="text-micro leading-relaxed text-text-secondary">
                  A repo named <span className="font-mono font-semibold text-text-primary">{repoNameInput.trim()}</span> already exists. Rename it above to create a new repo, or connect to the existing one and push these files into it.
                </p>
                <p className="text-micro leading-relaxed text-text-muted">
                  This is safe. It only adds your files to that repo — it never overwrites or deletes anything that's already there. If the repo has content that would clash, the push is declined and nothing changes.
                </p>
                <button onClick={adopt} disabled={actionsDisabled} className="flex items-center gap-2 px-3.5 py-2 text-small font-medium bg-warning/20 hover:bg-warning/30 disabled:opacity-40 text-warning rounded-lg transition-colors">
                  {busy ? <><Loader2 size={12} className="animate-spin" /> Connecting…</> : <><GitBranch size={12} /> Connect &amp; push my files up</>}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-micro text-warning/70">
            Creating new repos needs the GitHub App installed on an <span className="font-semibold">organization</span> — a personal-account install can only link existing repos. Link one below, or install the App on an org under Organisation › Settings › GitHub.
          </div>
        )}
      </div>
      )}
      {appRegistered && (hasFiles ? (
        <div className="rounded-xl bg-surface-1 border border-border-subtle p-4 opacity-60 text-small text-text-muted">
          <span className="font-semibold text-text-muted">Link existing — unavailable.</span> This location already has files; linking would overwrite them. Use Back up to push these up, or link a repo into an empty location.
        </div>
      ) : mode === 'link' ? (
        <div className="rounded-xl bg-surface-1 border border-border-subtle p-4 space-y-3">
          <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://github.com/org/repo" autoFocus className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
          <div className="flex items-center gap-2">
            <button onClick={() => { setMode('idle'); setLinkUrl('') }} className="text-small text-text-muted hover:text-text-primary px-2">Cancel</button>
            <button onClick={() => linkUrl.trim() && run(() => connect({ target, mode: 'link', repoUrl: linkUrl.trim() }))} disabled={actionsDisabled || !linkUrl.trim()} className="flex items-center gap-2 px-4 py-2 text-body font-medium bg-accent hover:bg-accent-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Linking…</> : <><Link2 size={14} /> Link repo</>}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setMode('link')} disabled={actionsDisabled} className="flex items-center gap-2 px-4 py-2 text-body font-medium text-text-secondary hover:text-text-primary border border-border hover:border-border rounded-lg transition-all">
          <Link2 size={14} /> Link existing repo
        </button>
      ))}
    </section>
  )
}

function Heading() {
  return (
    <div>
      <h3 className="text-h3 font-semibold text-text-primary">Repository</h3>
      <p className="text-small text-text-muted">Connect a GitHub repo — back up these files or check out an existing repo. Agents mount it and push during runs.</p>
    </div>
  )
}
