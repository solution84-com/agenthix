import { useEffect, useState } from 'react'
import { useQuery, useAction, getRepoState, getWorkflows, getRuns, dispatchWorkflow } from 'wasp/client/operations'
import { FILES_BUTTON, changedLabel } from '@agenthix/ui/projects'
import { FilesGroupHeading, FilesQuietLine } from '@agenthix/ui/projects'
import type { Target } from './filesToolData'

const fileOf = (path: string) => path.split('/').pop() ?? path

/**
 * A workspace's GitHub workflow runs with **Run a workflow** (spec §3). It shows only once a repository is
 * connected, and says so quietly when the repository's state cannot be read rather than hiding.
 */
export function WorkspaceRuns({ target }: { target: Target }) {
  const { data: state, error: stateError } = useQuery(getRepoState, { target })
  const connected = !!state?.repoUrl
  const { data: workflows } = useQuery(getWorkflows, { target }, { enabled: connected })
  // Poll while a run is queued or in progress so the person watches it finish; stop once every run is terminal.
  const [poll, setPoll] = useState<number | false>(false)
  const { data: runs } = useQuery(getRuns, { target }, { enabled: connected, refetchInterval: poll })
  useEffect(() => {
    setPoll(Array.isArray(runs) && runs.some(r => r.status === 'queued' || r.status === 'in_progress') ? 5000 : false)
  }, [runs])
  const dispatch = useAction(dispatchWorkflow)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (stateError) return <FilesQuietLine role="status">GitHub runs are unavailable: this workspace's repository could not be read.</FilesQuietLine>
  if (!connected) return null

  const run = async (workflowFile: string) => {
    setChoosing(false); setError(null)
    try { await dispatch({ target, workflowFile }) } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
  }
  const now = new Date()
  return (
    <section aria-label="GitHub runs">
      <div className="flex items-center justify-between pr-4">
        <FilesGroupHeading>GitHub runs</FilesGroupHeading>
        <button type="button" className={FILES_BUTTON} aria-expanded={choosing} onClick={() => setChoosing(c => !c)} disabled={!workflows?.length}>Run a workflow ▾</button>
      </div>
      {choosing && (
        <ul className="mx-4 mb-2 overflow-hidden rounded-lg border border-border bg-surface-1">
          {(workflows ?? []).map(w => (
            <li key={w.id}><button type="button" onClick={() => void run(fileOf(w.path))} className="block w-full px-3 py-1.5 text-left font-mono text-small text-text-primary hover:bg-surface-hover">{fileOf(w.path)}</button></li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="px-4 text-small text-danger">{error}</p>}
      {!workflows?.length && <FilesQuietLine>No workflows in the repository yet. Ask an agent to add one through a pull request.</FilesQuietLine>}
      {(runs ?? []).slice(0, 8).map(r => (
        <a key={r.id} href={r.htmlUrl} target="_blank" rel="noreferrer" className="flex items-baseline justify-between gap-2 border-b border-border-subtle px-4 py-2 text-small hover:bg-surface-hover">
          <span className="min-w-0 truncate text-text-primary"><b>{r.name}</b> <span className="text-text-muted">#{r.runNumber}</span></span>
          <span className="shrink-0 text-text-muted">{r.conclusion ?? r.status} · {changedLabel(r.createdAt, now)}</span>
        </a>
      ))}
      {workflows?.length ? (!runs?.length && <FilesQuietLine>No runs yet.</FilesQuietLine>) : null}
    </section>
  )
}
