import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getProjectGitHubAccounts, getPlaceWorkflows, setProjectGitHubDefault } from 'wasp/client/operations'
import { NativeSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import { repoName } from '../../storage/pages/BackupLine'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

export const repoOwnerOf = (repoUrl: string): string => repoName(repoUrl).split('/')[0] ?? ''

/**
 * A project's GitHub section (workflows spec part 5): the default account every new workspace starts with, the
 * workspaces with their repository and account, and the workflows that reach GitHub.
 */
export function ProjectGitHubSection({ projectId, basePath }: { projectId: string; basePath: string }) {
  const { data, error, refetch } = useQuery(getProjectGitHubAccounts, { projectId })
  const { data: wf } = useQuery(getPlaceWorkflows, { place: { type: 'project', id: projectId } })
  const { workspaces } = useWorkspaces({ ownerType: 'project', ownerId: projectId })
  const setDefault = useAction(setProjectGitHubDefault)
  const [failure, setFailure] = useState<unknown>(null)

  if (error) return <ReadFailure what="The GitHub accounts" retry={() => void refetch()} />
  if (!data) return <p className="px-6 py-6 text-small text-text-muted">Loading…</p>

  const defaultAccount = data.accounts.find((a) => a.id === data.defaultId) ?? null
  const reaching = (wf?.workflows ?? []).filter((w) => w.approved && Object.keys(w.approved.definition.github ?? {}).length > 0)

  const change = async (installationId: string) => {
    setFailure(null)
    try { await setDefault({ projectId, installationId: installationId || null }); await refetch() } catch (e) { setFailure(e) }
  }

  return (
    <div className="max-w-3xl space-y-8 px-4 py-5">
      <section aria-label="Default account" className="space-y-2">
        <h2 className="text-h3 font-medium text-text-primary">Default account</h2>
        {data.accounts.length === 0 ? (
          <p className="text-small text-text-muted">No GitHub account is allowed for this project yet. An organisation administrator allows one under Manage organisation › Settings › GitHub.</p>
        ) : (
          <>
            <NativeSelect aria-label="Default GitHub account" className="max-w-xs" value={data.defaultId ?? ''} disabled={!data.mayChangeDefault} onChange={(e) => void change(e.target.value)}>
              <option value="">None chosen</option>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.login}</option>)}
            </NativeSelect>
            <p className="text-small text-text-muted">
              New workspaces start with this account; each can choose another this project may connect to.
              {!data.mayChangeDefault && ' A project administrator changes it.'} The list shows the accounts allowed for this project on Manage organisation › Settings › GitHub.
            </p>
          </>
        )}
        <ShowAttention kind="alert" text={failure} title="The default was not changed" onClose={() => setFailure(null)} />
      </section>

      <section aria-label="Workspaces and their repositories" className="space-y-2">
        <h2 className="text-h3 font-medium text-text-primary">Workspaces and their repositories</h2>
        {workspaces && workspaces.length === 0 && <p className="text-small text-text-muted">This project has no workspaces yet.</p>}
        {workspaces && workspaces.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-left text-small" data-testid="workspace-repos">
              <thead className="bg-surface-2 text-micro uppercase tracking-wide text-text-muted"><tr><th className="px-3 py-2">Workspace</th><th className="px-3 py-2">Repository</th><th className="px-3 py-2">Account</th></tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {workspaces.map((w) => {
                  const owner = w.repoUrl ? repoOwnerOf(w.repoUrl) : null
                  const isDefault = !!owner && !!defaultAccount && defaultAccount.login.toLowerCase() === owner.toLowerCase()
                  return (
                    <tr key={w.id}>
                      <td className="px-3 py-2 font-medium text-text-primary">{w.name}</td>
                      <td className="px-3 py-2 font-mono">{w.repoUrl ? <a href={w.repoUrl} target="_blank" rel="noopener noreferrer" className={`rounded hover:underline ${FOCUS_RING}`}>{repoName(w.repoUrl)}</a> : <span className="font-sans text-text-muted">Not connected</span>}</td>
                      <td className="px-3 py-2">{owner ? <>{owner} <span className="text-text-muted">· {isDefault ? 'default' : 'changed'}</span></> : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-small text-text-muted">Connect a workspace's repository from its About, or from Back up to GitHub at the top of Files.</p>
      </section>

      <section aria-label="Workflows that reach GitHub" className="space-y-2">
        <h2 className="text-h3 font-medium text-text-primary">Workflows that reach GitHub</h2>
        <p className="text-small text-text-secondary">
          {reaching.length > 0 ? reaching.map((w) => w.name).join(', ') : 'None approved yet.'}{' · '}
          <Link to={`${basePath}?tool=workflows`} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Open Workflows</Link>
        </p>
      </section>
    </div>
  )
}
