/**
 * GitHub Actions — workflows, runs, secrets (read), dispatch (ADR-0037).
 * Target-keyed (RepoAttachment): GitHub is the source of truth, so these are stateless
 * reads/relays — no parallel DB state. Ported from the project-centric reference branch.
 */
import { githubFetch } from './githubClient'
import { resolveRepoApi } from './repoApi'
import type { RepoTarget } from '../storage/repoAttachmentService'

export type WorkflowItem = { id: number; name: string; path: string; state: string }
export type RunSummary = {
  id: number; name: string; status: string; conclusion: string | null
  runNumber: number; headSha: string; createdAt: string; htmlUrl: string
}
export type SecretItem = { name: string; updatedAt: string }

export async function listWorkflows(target: RepoTarget): Promise<WorkflowItem[]> {
  const { owner, repo, token } = await resolveRepoApi(target)
  const res = await githubFetch(token, `/repos/${owner}/${repo}/actions/workflows`)
  const data = (await res.json()) as { workflows: WorkflowItem[] }
  return data.workflows.map((w) => ({ id: w.id, name: w.name, path: w.path, state: w.state }))
}

export async function listRuns(target: RepoTarget, perPage = 20): Promise<RunSummary[]> {
  const { owner, repo, token } = await resolveRepoApi(target)
  const res = await githubFetch(token,`/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`)
  const data = (await res.json()) as {
    workflow_runs: Array<{
      id: number; name?: string; display_title?: string; status: string; conclusion: string | null
      run_number: number; head_sha?: string; created_at: string; html_url: string
    }>
  }
  return data.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name ?? r.display_title ?? '',
    status: r.status,
    conclusion: r.conclusion,
    runNumber: r.run_number,
    headSha: (r.head_sha ?? '').slice(0, 7),
    createdAt: r.created_at,
    htmlUrl: r.html_url,
  }))
}

/** Which secrets are SET on the repo — names + timestamps only. GitHub never returns values. */
export async function listSecrets(target: RepoTarget): Promise<SecretItem[]> {
  const { owner, repo, token } = await resolveRepoApi(target)
  const res = await githubFetch(token,`/repos/${owner}/${repo}/actions/secrets`)
  const data = (await res.json()) as { secrets: Array<{ name: string; updated_at: string }> }
  return data.secrets.map((s) => ({ name: s.name, updatedAt: s.updated_at }))
}

/** Trigger workflow_dispatch on the default branch. Requires `on: workflow_dispatch` in the workflow. */
export async function dispatchWorkflow(target: RepoTarget, workflowFile: string): Promise<void> {
  const { owner, repo, token } = await resolveRepoApi(target)
  const repoRes = await githubFetch(token,`/repos/${owner}/${repo}`)
  const { default_branch } = (await repoRes.json()) as { default_branch: string }
  await githubFetch(token,`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: default_branch }),
  })
}
