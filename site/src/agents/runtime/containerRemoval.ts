/**
 * Removing a person's or a project's containers when their right to them ends
 * (person-scoped execution spec §4): a member leaving a project, a person
 * leaving the organisation, a project being deleted.
 *
 * Its own module, beside the two sweeps in containerLifecycle.ts, to keep
 * AgentContainerManager.ts under the repo's file-size limit. It shares the
 * manager's state map by reference, as the sweeps do.
 *
 * Unlike the sweeps it is an instruction someone is waiting on, so it never
 * skips quietly: a container with a run in it refuses the whole call before
 * anything is removed (the caller stops runs first), a failed removal throws,
 * and so does a daemon that cannot be asked under container isolation. A
 * preview serving out of a matching container does not keep it — the person
 * whose container it is no longer has a right to it — and its registry is told
 * through the same destroyed-container notice every removal sends.
 */
import type { CapabilityRunner } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { labelKey, resolveComposeProjectName, runnerLabelValue } from './containerLabels'
import { DOCKER_SWEEP_TIMEOUT_MS, dockerWithin } from './containerLifecycle'
import type { ContainerState } from './containerTypes'

const logger = new Logger('AgentContainerManager')

export interface ContainerRemovalFilter {
  runner?: CapabilityRunner
  ownerType?: 'project' | 'user'
  ownerId?: string
}

interface RemovalDeps {
  states: Map<string, ContainerState>
  /** Clears everything the manager keeps for a removed container, and announces it. */
  forget: (name: string) => void
}

function matches(filter: ContainerRemovalFilter, owner: string, runner: string): boolean {
  const sep = owner.indexOf(':')
  const ownerType = sep > 0 ? owner.slice(0, sep) : ''
  const ownerId = sep > 0 ? owner.slice(sep + 1) : ''
  if (filter.ownerType !== undefined && ownerType !== filter.ownerType) return false
  if (filter.ownerId !== undefined && ownerId !== filter.ownerId) return false
  if (filter.runner !== undefined && runner !== runnerLabelValue(filter.runner)) return false
  return true
}

async function listMatching(filter: ContainerRemovalFilter): Promise<string[]> {
  let stdout: string
  try {
    ({ stdout } = await dockerWithin([
      'ps', '-a',
      '--filter', `label=${labelKey('owner')}`,
      '--filter', `label=com.docker.compose.project=${resolveComposeProjectName()}`,
      '--format', `{{.Names}}\t{{.Label "${labelKey('owner')}"}}\t{{.Label "${labelKey('runner')}"}}`,
    ], DOCKER_SWEEP_TIMEOUT_MS))
  } catch (err) {
    // With isolation off this site starts no containers, so there are none to
    // remove. With it on, an unanswered daemon means containers may still be
    // there, and the caller must not be told they are gone.
    if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return []
    throw new Error(`Could not list containers to remove: ${err instanceof Error ? err.message : String(err)}`)
  }
  const names: string[] = []
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const [name, owner = '', runner = ''] = line.split('\t')
    if (name && matches(filter, owner, runner)) names.push(name)
  }
  return names
}

export async function removeContainersFor(filter: ContainerRemovalFilter, deps: RemovalDeps): Promise<number> {
  if (filter.runner === undefined && filter.ownerType === undefined && filter.ownerId === undefined) {
    throw new Error('removeContainersFor needs at least one of runner, ownerType or ownerId')
  }
  const names = await listMatching(filter)

  // Checked and marked with no await in between, so no run can slip into one
  // of these containers after it was found idle and before it is removed: a
  // run starting now meets `stopping` in ensureRunning and waits for the rm.
  const isBusy = (state: ContainerState | undefined) => !!state && (state.activeRuns > 0 || !!state.starting)
  const busy = names.filter(name => isBusy(deps.states.get(name)))
  if (busy.length > 0) {
    throw new Error(`Refusing to remove ${busy.length} container(s) with a run still active: ${busy.join(', ')}`)
  }
  const claimed = new Map<string, { state: ContainerState; done: () => void }>()
  const claim = (name: string) => {
    let state = deps.states.get(name)
    if (!state) {
      state = { activeRuns: 0, lastActivity: Date.now() }
      deps.states.set(name, state)
    }
    let done!: () => void
    state.stopping = new Promise<void>(resolve => { done = resolve })
    claimed.set(name, { state, done })
  }
  // One an idle sweep is already removing keeps the sweep's own marker; it is
  // claimed once that removal has landed, below.
  for (const name of names) if (!deps.states.get(name)?.stopping) claim(name)

  let removed = 0
  const failed: string[] = []
  for (const name of names) {
    if (!claimed.has(name)) {
      await deps.states.get(name)?.stopping
      if (isBusy(deps.states.get(name))) { failed.push(name); continue }
      claim(name)
    }
    const { state, done } = claimed.get(name)!
    try {
      const ok = await dockerWithin(['rm', '-f', name], DOCKER_SWEEP_TIMEOUT_MS).then(
        () => true,
        (err: unknown) => /no such container/i.test(err instanceof Error ? err.message : String(err)) ? null : false,
      )
      if (ok === false) {
        failed.push(name)
      } else {
        deps.forget(name)
        if (ok) {
          logger.info(`[container] removed ${name}`)
          removed++
        }
      }
    } finally {
      delete state.stopping
      done()
    }
  }
  if (failed.length > 0) {
    throw new Error(`Could not remove ${failed.length} container(s): ${failed.join(', ')}`)
  }
  return removed
}
