/**
 * A run's network (workflows spec part 2, *The containers* D and *How an executor container is started*): none at
 * all without hosts; with hosts, its own internal network whose only other member is its own egress proxy, which
 * is also the steps' name server. A proxy serves one run, so runs are told apart by network and process, never by
 * a source address, and nothing listens for a step but on the run's own network: no agent's container, nor any other
 * run's step, is on it. A proxy per run rather than one in the site, because the site in development is not a
 * container and can't join a Docker network, and because a site that joined each run's network would put its own
 * server in reach of the steps.
 */
import { formatWorkflowHost, type WorkflowHost } from '@agenthix/core'
import { RunNetworkRefused, type RunNetwork } from '../seams'
import { createRunNetwork, listRunNetworks, proxyAddress, removeRunNetwork, runNetworkNames } from './networks'
import { listProxyContainers, startProxyContainer, type ProxyContainer } from './proxyContainer'
import { removeContainer } from '../stepRunner'

/** DNS's own port, where the proxy answers the steps' lookups: Docker's resolver sends them to no other. */
export const DNS_PORT = 53

export type RunNetworkOptions = {
  /** Tests only: a network the proxy goes out by instead of one of its own, which is then never removed. */
  egressNetwork?: string
  /** Tests only: the name servers the proxy resolves approved names with. */
  upstreamDns?: string[]
}

const NO_NETWORK: RunNetwork = { dockerArgs: ['--network', 'none'], release: async () => {} }

export function checkRunHosts(hosts: WorkflowHost[]): void {
  const onDns = hosts.filter(h => h.port === DNS_PORT)
  if (onDns.length > 0) {
    throw new RunNetworkRefused(`A workflow step can't reach ${onDns.map(formatWorkflowHost).join(', ')}: port ${DNS_PORT} `
      + 'is where the site answers the steps\' name lookups. Whoever can change the workflow can propose a version '
      + 'without it. Nothing was changed.')
  }
}

export async function startRunNetwork(runId: string, hosts: WorkflowHost[], opts: RunNetworkOptions = {}): Promise<RunNetwork> {
  if (hosts.length === 0) return NO_NETWORK
  checkRunHosts(hosts)
  const names = runNetworkNames(runId)
  const made: string[] = []
  let proxy: ProxyContainer | null = null
  let released = false
  const release = async () => {
    if (released) return
    released = true
    const problems: string[] = []
    await (proxy ? proxy.stop() : removeContainer(names.proxy)).catch(err => problems.push(String(err)))
    for (const n of made) await removeRunNetwork(n).catch(err => problems.push(String(err)))
    if (problems.length) throw new Error(`The run's network was not all removed: ${problems.join('; ')}`)
  }
  try {
    const subnet = await createRunNetwork(names.internal, runId, true)
    made.push(names.internal)
    let egress = opts.egressNetwork
    if (!egress) {
      await createRunNetwork(names.egress, runId, false)
      made.push(names.egress)
      egress = names.egress
    }
    const address = proxyAddress(subnet)
    proxy = await startProxyContainer({
      runId, name: names.proxy, internalNetwork: names.internal, egressNetwork: egress,
      config: { address, dnsPort: DNS_PORT, hosts }, upstreamDns: opts.upstreamDns,
    })
    // No search domain: a short name is never sent out with the machine's domain on it.
    return { dockerArgs: ['--network', names.internal, '--dns', address, '--dns-search', '.'], release }
  } catch (err) {
    await release().catch(() => {})
    throw err
  }
}

/** Every proxy container and run network a crash left behind; how many networks it removed. */
export async function sweepEgress(): Promise<number> {
  for (const name of await listProxyContainers()) await removeContainer(name)
  let removed = 0
  for (const name of await listRunNetworks()) {
    await removeRunNetwork(name)
    removed++
  }
  return removed
}
