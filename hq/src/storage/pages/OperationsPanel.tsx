import { useEffect, useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Link } from 'react-router'
import { useQuery, getRepoState, getWorkflows, getRuns, getRepoSecrets, getPlaceWorkflows } from 'wasp/client/operations'
import { FilesGroupHeading, FilesQuietLine, changedLabel } from '@agenthix/ui/projects'
import { whenWords } from '../../workflows/pages/workflowWords'
import type { Target as ExplorerTarget } from './filesToolData'
import { ReadNudge, siteReadRetry, useSiteRead } from '../../shared/siteRead'

const fileOf = (path: string) => path.split('/').pop() ?? path

/**
 * A connected workspace's GitHub section in its About (workflows spec part 5, G3): the workflows that reach GitHub,
 * the repository's own GitHub workflows with their last run, and the secrets on GitHub by name. Nothing is sent to
 * GitHub from here, and there is no Run button: a GitHub workflow runs through a workflow or on GitHub, and a secret
 * reaches GitHub from the Vault through `set-github-secrets`.
 * Self-gates: nothing until a repository is connected, and the reason when its state cannot be read.
 */
export function OperationsPanel({ target }: { target: ExplorerTarget }) {
  // The read's failure is read, not ignored: the repository state is read from the Execution Site that holds the
  // location, so a site that is down makes this query FAIL rather than answer "not connected". Dropped, that failure
  // rendered as `connected === false` and the whole section vanished with no reason.
  const stateQuery = useQuery(getRepoState, { target }, { retry: siteReadRetry })
  const state = stateQuery.data
  const stateRead = useSiteRead(stateQuery, { what: 'GitHub details' })
  const connected = !!state?.repoUrl
  const place = { type: target.ownerType, id: target.ownerId }
  const { data: library } = useQuery(getPlaceWorkflows, { place }, { enabled: connected })
  const { data: workflows } = useQuery(getWorkflows, { target }, { enabled: connected })
  // Poll runs while one is queued or in progress so the last run is current; stop once every run has ended.
  const [runsPoll, setRunsPoll] = useState<number | false>(false)
  const { data: runs } = useQuery(getRuns, { target }, { enabled: connected, refetchInterval: runsPoll })
  useEffect(() => {
    setRunsPoll(Array.isArray(runs) && runs.some((r) => r.status === 'queued' || r.status === 'in_progress') ? 5000 : false)
  }, [runs])
  const { data: secrets } = useQuery(getRepoSecrets, { target }, { enabled: connected })

  if (stateRead.failedWithoutData) return <ReadNudge read={stateRead} />
  if (!connected) return null

  const repoUrl = state?.repoUrl ?? ''
  const reaching = (library?.workflows ?? []).filter((w) => w.approved && Object.keys(w.approved.definition.github ?? {}).length > 0)
  const now = new Date()
  const lastRunOf = (name: string) => (runs ?? []).find((r) => r.name === name)

  return (
    <section aria-label="GitHub" data-testid="workspace-github">
      <FilesGroupHeading>Workflows that reach GitHub</FilesGroupHeading>
      {reaching.length === 0 && <FilesQuietLine>None are approved yet.</FilesQuietLine>}
      <ul>
        {reaching.map((w) => (
          <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border-subtle px-4 py-2 text-small">
            <Link to={`/workflows/${w.id}`} className={`rounded font-mono text-text-primary hover:underline ${FOCUS_RING}`}>{w.name}</Link>
            <span className="text-text-muted">
              {w.enabled ? 'On' : 'Off'} · {w.lastRun ? `last run ${whenWords(w.lastRun.endedAt ?? w.lastRun.startedAt)} · ${w.lastRun.state}` : 'never run'}
            </span>
          </li>
        ))}
      </ul>

      <FilesGroupHeading>GitHub workflows in the repository</FilesGroupHeading>
      {!workflows?.length && <FilesQuietLine>None yet. An agent adds one through a pull request.</FilesQuietLine>}
      <ul>
        {(workflows ?? []).map((w) => {
          const run = lastRunOf(w.name)
          return (
            <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border-subtle px-4 py-2 text-small">
              <span className="font-mono text-text-primary">{fileOf(w.path)}</span>
              {run ? (
                <a href={run.htmlUrl} target="_blank" rel="noreferrer" className={`rounded text-text-muted hover:underline ${FOCUS_RING}`}>
                  Last run #{run.runNumber} {changedLabel(run.createdAt, now)} · {run.conclusion ?? run.status} ↗
                </a>
              ) : <span className="text-text-muted">No run yet</span>}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between pr-4">
        <FilesGroupHeading>Secrets on GitHub</FilesGroupHeading>
        <a href={`${repoUrl}/settings/secrets/actions`} target="_blank" rel="noreferrer" className={`rounded text-micro text-link hover:underline ${FOCUS_RING}`}>Manage on GitHub ↗</a>
      </div>
      {!secrets?.length && <FilesQuietLine>None. To set one for GitHub workflows, add it in the Vault and tick Also set it on GitHub.</FilesQuietLine>}
      <ul>
        {(secrets ?? []).map((s) => (
          <li key={`${s.environment ?? ''}/${s.name}`} className="border-b border-border-subtle px-4 py-2 text-small">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 break-all font-mono text-text-primary">{s.name} <span className="font-sans text-text-muted">{s.environment ? `${s.environment} environment` : 'repository'}</span></span>
              <span className="text-text-muted">{s.fromHq ? 'From Secrets' : 'Outside HQ'}</span>
            </div>
            {s.note && <p className="text-micro text-text-muted">{s.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
