import { useEffect, useState } from 'react'
import { useQuery, useAction } from 'wasp/client/operations'
import { getRepoState, getWorkflows, getRuns, getRepoSecrets, dispatchWorkflow, setRepoSecret } from 'wasp/client/operations'
import { Loader2 } from 'lucide-react'
import type { Target as ExplorerTarget } from './filesToolData'

// Operations over a connected repo (ADR-0037): GitHub Actions workflows + runs, secret
// relay, and manual dispatch — target-keyed, beside RepoPanel in the GitHub tab.
// Self-gates: renders nothing until a repo is connected to this target.
export function OperationsPanel({ target, secretsOnly }: { target: ExplorerTarget; secretsOnly?: boolean }) {
  // `stateError` is destructured, not ignored: the repository state is read
  // from the Execution Site that holds the location, so a site that is down or
  // refuses makes this query FAIL rather than answer "not connected". Dropped
  // on the floor, that failure rendered as `connected === false` and this
  // whole panel silently vanished — a person with a connected repository was
  // shown no Operations at all and no reason why.
  const { data: state, error: stateError } = useQuery(getRepoState, { target })
  const connected = !!state?.repoUrl

  const { data: workflows } = useQuery(getWorkflows, { target }, { enabled: connected })
  // Poll runs while one is queued/in-progress so the operator watches status live;
  // stop once every run is terminal. Interval is plain number|false (typed cleanly).
  const [runsPoll, setRunsPoll] = useState<number | false>(false)
  const { data: runs } = useQuery(getRuns, { target }, { enabled: connected, refetchInterval: runsPoll })
  useEffect(() => {
    const inFlight = Array.isArray(runs) && runs.some((r) => r.status === 'queued' || r.status === 'in_progress')
    setRunsPoll(inFlight ? 5000 : false)
  }, [runs])
  const { data: secrets } = useQuery(getRepoSecrets, { target }, { enabled: connected })
  const dispatch = useAction(dispatchWorkflow)
  const saveSecret = useAction(setRepoSecret)

  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (stateError) {
    return (
      <section className="mt-8 space-y-3">
        <Heading />
        <p className="text-small text-danger">
          Operations are unavailable: this location's repository state could not be read.{' '}
          {stateError instanceof Error ? stateError.message : 'The Execution Site did not answer.'}
        </p>
      </section>
    )
  }
  if (!connected) return null

  const repoUrl = state?.repoUrl ?? ''
  const fileOf = (path: string) => path.split('/').pop() ?? path
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <section className="mt-8 space-y-6">
      {!secretsOnly && <Heading />}
      {error && <p className="text-small text-danger">{error}</p>}

      {!secretsOnly && (
      <div>
        <div className="text-micro font-medium uppercase tracking-wide text-text-muted/70 mb-2">Workflows</div>
        {(workflows ?? []).map((w) => (
          <div key={w.id} className="flex items-center justify-between rounded-xl bg-surface-1 border border-border-subtle px-3 py-2 mb-2">
            <span className="font-mono text-body text-text-secondary">{fileOf(w.path)}</span>
            <button disabled={busy} className="text-accent text-small hover:text-accent/80 disabled:opacity-40 transition-colors" onClick={() => run(() => dispatch({ target, workflowFile: fileOf(w.path) }))}>Run</button>
          </div>
        ))}
        {!workflows?.length && <div className="text-text-muted text-small">No workflows in the repo yet — ask the agent to add one via a PR.</div>}
      </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-micro font-medium uppercase tracking-wide text-text-muted/70">Secrets set on the repo</div>
          <a href={`${repoUrl}/settings/secrets/actions`} target="_blank" rel="noreferrer" className="text-micro text-accent/70 hover:text-accent transition-colors">Manage on GitHub ↗</a>
        </div>
        {(secrets ?? []).map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded-xl bg-surface-1 border border-border-subtle px-3 py-2 mb-2">
            <span className="font-mono text-body text-text-secondary">{s.name} <span className="text-text-muted">••••</span></span>
            <span className="text-text-muted text-small">updated {new Date(s.updatedAt).toLocaleDateString()}</span>
          </div>
        ))}
        {!secrets?.length && <div className="text-text-muted text-small">No secrets set yet. Add one below (it's relayed to GitHub) — delete or edit existing ones via “Manage on GitHub”.</div>}
      </div>

      <div>
        <div className="text-micro font-medium uppercase tracking-wide text-text-muted/70 mb-2">Add a secret (sent to GitHub, never stored or shown here)</div>
        <div className="flex gap-2 items-start">
          <input className="rounded-lg bg-surface-2 border border-border px-2 py-1 text-body font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" placeholder="NAME" value={name} onChange={(e) => setName(e.target.value)} />
          {/* textarea, not input: secret values can be multi-line (SSH keys, PEM certs) — a single-line input strips newlines and corrupts the key. */}
          <textarea className="flex-1 rounded-lg bg-surface-2 border border-border px-2 py-1 text-body font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y" placeholder="value (multi-line ok — e.g. an SSH private key, BEGIN/END lines included)" rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
          <button disabled={busy || !name.trim() || !value} className="text-accent text-small hover:text-accent/80 disabled:opacity-40 transition-colors" onClick={() => run(async () => { await saveSecret({ target, name, value }); setName(''); setValue('') })}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>

      {!secretsOnly && (
      <div>
        <div className="text-micro font-medium uppercase tracking-wide text-text-muted/70 mb-2">Recent runs</div>
        {(runs ?? []).map((r) => (
          <a key={r.id} href={r.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-surface-1 border border-border-subtle px-3 py-2 mb-2 hover:border-accent transition-colors">
            <span className="font-mono text-body text-text-secondary">{r.name} <span className="text-text-muted">#{r.runNumber} · {r.headSha}</span></span>
            <span className="font-mono text-small text-text-secondary">{r.conclusion ?? r.status}</span>
          </a>
        ))}
        {!runs?.length && <div className="text-text-muted text-small">No runs yet.</div>}
      </div>
      )}
    </section>
  )
}

function Heading() {
  return (
    <div>
      <h3 className="text-h3 font-semibold text-text-primary">Operations <span className="text-text-muted text-small">(GitHub Actions)</span></h3>
      <p className="text-small text-text-muted">Run the agent-authored workflows. Secrets are sent to GitHub, never stored or shown here; approving what runs is a GitHub PR + branch protection.</p>
    </div>
  )
}
