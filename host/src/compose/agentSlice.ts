/**
 * The installation's agent slice (one port plan, Rule 6): the /20 of the agents' block its site gives its agent
 * containers a /29 each from, and the one range its firewall rules cover. Several installations on one machine each
 * have their own, so neither's agents share addresses with the other's, and neither's rules reach the other's agents.
 *
 * Picked once, when a site is first installed in this installation: the first slice that overlaps no Docker network,
 * none of the machine's own addresses, and no slice another installation labels its containers with (running or
 * stopped). It is recorded in `installation.json` and read back by every operation after, so an upgrade, a rewritten
 * compose file or a restart never picks again. An installation without a site takes none.
 */
import { ADDRESS_BLOCKS, AGENT_SLICE_BITS } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import type { InstallNames } from '../state/namespace'
import { installationOf, recordAgentRange } from '../state/installation'
import { agentRangeRecorded } from '../protections/protections'
import { firstFree, machineAddresses, SubnetsExhausted, takenRanges, type DockerNetwork } from './subnets'

const LABEL = /^([a-z][a-z0-9-]{0,30})\.agent-range$/

export type OtherSlice = { namespace: string; range: string }

/** The slices other installations on the machine label their containers with. */
export function agentRangesOfOthers(containers: Record<string, string>[], namespace: string): OtherSlice[] {
  const found = new Map<string, OtherSlice>()
  for (const labels of containers) {
    for (const [key, range] of Object.entries(labels)) {
      const ns = LABEL.exec(key)?.[1]
      if (ns && ns !== namespace) found.set(`${ns} ${range}`, { namespace: ns, range })
    }
  }
  return [...found.values()]
}

/** The first free slice. Throws `SubnetsExhausted`, in words a person reads, when none is left. */
export function chooseAgentSlice(existing: DockerNetwork[], machine: string[], others: OtherSlice[]): string {
  const free = firstFree(ADDRESS_BLOCKS.agents, AGENT_SLICE_BITS, [...takenRanges(existing, machine), ...others.map(o => o.range)])
  if (free) return free
  const holders = [...new Set(others.map(o => o.namespace))].sort()
  throw new SubnetsExhausted(
    `No address range is left for this installation's agents: ${ADDRESS_BLOCKS.agents}, which installations' agents ` +
    `are given a /${AGENT_SLICE_BITS} each from, is all used by other Docker networks, this machine's own addresses` +
    `${holders.length ? ` or the installations ${holders.join(', ')}` : ''}. Uninstall an installation you no longer ` +
    'need, or remove the Docker networks you no longer need (see them with docker network ls, and remove one with ' +
    'docker network rm), then try again. Nothing was changed.',
  )
}

export type SliceContext = {
  state: StateFolder
  names: Pick<InstallNames, 'namespace'>
  docker: { networks(): Promise<DockerNetwork[]>; machineContainers(): Promise<{ labels: Record<string, string> }[]> }
  machineAddresses?: () => string[]
}

/** The installation's slice: the recorded one, else the one it would be given now. Writes nothing. */
export async function pickAgentSlice(ctx: SliceContext): Promise<string> {
  const recorded = installationOf(ctx.state).agentRange
  if (recorded) return recorded
  const [networks, containers] = await Promise.all([ctx.docker.networks(), ctx.docker.machineContainers()])
  const labels = containers.map(c => c.labels)
  return chooseAgentSlice(networks, (ctx.machineAddresses ?? machineAddresses)(), agentRangesOfOthers(labels, ctx.names.namespace))
}

/**
 * Records the slice a site's first install picked, before the site's compose file is written. The agent
 * protections are told at once, so none says it holds for an installation without a slice once it has one.
 */
export function keepAgentSlice(state: StateFolder, range: string): void {
  if (installationOf(state).agentRange === range) return
  recordAgentRange(state, range)
  agentRangeRecorded()
}
