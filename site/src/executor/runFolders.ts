/**
 * Where a run's folders are on the site's disk: `<site root>/executor/runs/<run id>/`, with `workflow/` (the approved
 * files, `/run/workflow`), `out/` (`/run/out`) and `snapshot/` (the copy of the workspace). Outside every owner's
 * folder, so no agent's container, which binds only its owner's folder, can see them; on the same disk as the
 * workspaces, so the snapshot can be a copy-on-write clone. Derived from the run's id, never stored (ADR-0039).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getSiteRoot } from '../agents/agentDiskPaths'

/** hq's run ids are cuid or uuid; anything else could climb out of the runs folder or break a container name. */
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function isRunId(id: unknown): id is string {
  return typeof id === 'string' && RUN_ID_RE.test(id)
}

export function executorRunsDir(): string {
  return path.join(getSiteRoot(), 'executor', 'runs')
}

export type RunFolders = { root: string; workflow: string; out: string; snapshot: string }

export function runFolders(runId: string): RunFolders {
  if (!isRunId(runId)) throw new Error('This is not a run id the site accepts.')
  const root = path.join(executorRunsDir(), runId)
  return { root, workflow: path.join(root, 'workflow'), out: path.join(root, 'out'), snapshot: path.join(root, 'snapshot') }
}

/** Creates the run's folder and its `workflow/` and `out/`; refuses a run whose folder already exists. */
export async function createRunFolders(runId: string): Promise<RunFolders> {
  const f = runFolders(runId)
  await fs.mkdir(executorRunsDir(), { recursive: true, mode: 0o700 })
  await fs.mkdir(f.root, { mode: 0o711 })
  await fs.mkdir(f.workflow, { mode: 0o755 })
  await fs.mkdir(f.out, { mode: 0o755 })
  return f
}

/** Removes everything of the run's on this disk. Safe to call when nothing is there. */
export async function removeRunFolders(runId: string): Promise<void> {
  const f = runFolders(runId)
  // A step that held the snapshot read-only can leave folders without write permission for their owner.
  await makeWritable(f.root).catch(() => {})
  await fs.rm(f.root, { recursive: true, force: true })
}

async function makeWritable(dir: string): Promise<void> {
  const entry = await fs.lstat(dir).catch(() => null)
  if (!entry || !entry.isDirectory()) return
  await fs.chmod(dir, (entry.mode & 0o777) | 0o700)
  for (const name of await fs.readdir(dir)) await makeWritable(path.join(dir, name))
}

/** Run ids with a folder here, for the sweep at start-up. */
export async function listRunFolderIds(): Promise<string[]> {
  const names = await fs.readdir(executorRunsDir()).catch(() => [] as string[])
  return names.filter(isRunId)
}
