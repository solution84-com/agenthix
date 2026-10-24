/**
 * Removing what a run left on this machine (workflows spec part 2; plan 2.13): its step containers, found by the
 * run's label, its network, its folders and its snapshot — when the run ends, and for every run a crash left behind
 * when the site starts. A run left unfinished by a crash is recorded as failed, with nothing more written back.
 */
import type { WorkflowRunResult } from '@agenthix/core'
import { dockerWithin } from '../agents/runtime/containerLifecycle'
import { Logger } from '../server/utils/logger'
import { listRunFolderIds, removeRunFolders } from './runFolders'
import * as record from './runRecord'
import { sweepRunNetworks, type RunNetwork } from './seams'
import { runLabel } from './stepContainer'
import { removeContainer } from './stepRunner'

const logger = new Logger('executor')
const LIST_TIMEOUT_MS = 30_000

/** Step containers on this machine: of one run, or of every run. */
export async function listStepContainers(runId?: string): Promise<string[]> {
  const filter = runId ? `label=${runLabel()}=${runId}` : `label=${runLabel()}`
  const { stdout } = await dockerWithin(['ps', '-a', '--filter', filter, '--format', '{{.Names}}'], LIST_TIMEOUT_MS)
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}

export async function cleanUpRun(runId: string, network: RunNetwork): Promise<void> {
  const problems: string[] = []
  try {
    for (const name of await listStepContainers(runId)) await removeContainer(name)
  } catch (err) {
    problems.push(`containers: ${err instanceof Error ? err.message : String(err)}`)
  }
  await network.release().catch(err => problems.push(`network: ${String(err)}`))
  await removeRunFolders(runId).catch(err => problems.push(`folders: ${String(err)}`))
  await record.recordSnapshotRemoved(runId).catch(err => problems.push(`snapshot record: ${String(err)}`))
  if (problems.length) throw new Error(problems.join('; '))
}

/** At start-up, before any run: every executor container, network, folder and snapshot left over is removed. */
export async function sweepExecutorLeftovers(): Promise<{ runs: number; containers: number; folders: number }> {
  const unfinished = await record.listUnfinishedRuns()
  for (const run of unfinished) {
    const ended = new Date().toISOString()
    const result: WorkflowRunResult = {
      runId: run.id, state: 'failed', startedAt: run.startedAt.toISOString(), endedAt: ended,
      failure: {
        code: 'site_error',
        message: run.state === 'WRITING_BACK'
          ? 'The site restarted while writing the run\'s changes back, so some of them may be in the workspace and others not.'
          : 'The site restarted during the run. Nothing was written back.',
      },
      steps: [], printedSecretNames: [], leaks: [], writeBack: null,
    }
    await record.recordResult(result)
  }
  let containers = 0
  try {
    for (const name of await listStepContainers()) {
      await removeContainer(name)
      containers++
    }
  } catch (err) {
    logger.warn('Could not remove leftover workflow containers', { error: err instanceof Error ? err.message : String(err) })
  }
  await sweepRunNetworks().catch(err => logger.warn('Could not remove leftover workflow networks', { error: String(err) }))
  const ids = new Set([...(await listRunFolderIds()), ...(await record.listSnapshotsNotRemoved())])
  for (const id of ids) {
    await removeRunFolders(id)
    await record.recordSnapshotRemoved(id)
  }
  return { runs: unfinished.length, containers, folders: ids.size }
}
