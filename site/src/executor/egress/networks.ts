/**
 * A run's two Docker networks (workflows spec part 2, *How an executor container is started*, Network): an internal
 * one, the steps' only network, whose only other member is the run's egress proxy, and the proxy's own way out.
 * Each is a /29 of the site's agent range (`AGENT_NETWORK_RANGE`, docs/architecture/ports.md), allocated as the
 * agents' networks are (`agents/runtime/containerNetwork.ts`), so the host service's agent protections — no machine
 * ports, no published ports, no metadata address — cover the steps and the proxy too. IPv4 only, like the agents'.
 *
 * The networks carry `<namespace>.network=workflow`, never the agents' `agent`, so the agent network sweep leaves
 * them alone, and `<namespace>.workflow-run=<run>`, which this module's sweep finds them by.
 */
import { allocateSubnet, agentNetworkLabel } from '../../agents/runtime/containerNetwork'
import { docker, dockerWithin, DOCKER_SWEEP_TIMEOUT_MS } from '../../agents/runtime/containerLifecycle'
import { resolveComposeProjectName, siteIdFilterArgs, siteIdLabelArgs, siteNamespace } from '../../agents/runtime/containerLabels'
import { runLabel } from '../stepContainer'

const NETWORK_KIND = 'workflow'
const CREATE_ATTEMPTS = 8

export type RunNetworkNames = { internal: string; egress: string; proxy: string }

export function runNetworkNames(runId: string): RunNetworkNames {
  const base = `${siteNamespace()}-workflow-${runId}`
  return { internal: `${base}-net`, egress: `${base}-egress`, proxy: `${base}-proxy` }
}

/** The proxy's address on a /29: the first after the gateway, which Docker gives the first. */
export function proxyAddress(subnet: string): string {
  const [base] = subnet.split('/')
  const o = base!.split('.').map(Number)
  const n = (((o[0]! << 24) >>> 0) + (o[1]! << 16) + (o[2]! << 8) + o[3]!) + 2
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

let queue: Promise<unknown> = Promise.resolve()

/** Serialised, so two runs starting together can't pick the same block; an agent's network is told apart by Docker. */
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch(() => {})
  return run
}

async function subnetsInUse(): Promise<Set<string>> {
  const { stdout } = await docker(['network', 'ls', '-q'])
  const ids = stdout.split('\n').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return new Set()
  const out = await docker(['network', 'inspect', '--format', '{{range .IPAM.Config}}{{.Subnet}} {{end}}', ...ids])
  return new Set(out.stdout.split(/\s+/).filter(Boolean))
}

/** Creates a run network on a free /29 and returns that /29. */
export function createRunNetwork(name: string, runId: string, internal: boolean): Promise<string> {
  return serialised(async () => {
    const used = await subnetsInUse()
    for (let attempt = 1; ; attempt++) {
      const subnet = allocateSubnet(used)
      try {
        await docker([
          'network', 'create', '--driver', 'bridge', '--subnet', subnet, '--ipv6=false',
          ...(internal ? ['--internal'] : []),
          '--label', `${agentNetworkLabel()}=${NETWORK_KIND}`,
          '--label', `${runLabel()}=${runId}`,
          '--label', `com.docker.compose.project=${resolveComposeProjectName()}`,
          ...siteIdLabelArgs(),
          name,
        ])
        return subnet
      } catch (err) {
        // Another network on the machine, an agent's or not ours at all, holds this block.
        if (!/overlap/i.test(String(err)) || attempt >= CREATE_ATTEMPTS) throw err
        used.add(subnet)
      }
    }
  })
}

export async function removeRunNetwork(name: string): Promise<void> {
  await dockerWithin(['network', 'rm', name], DOCKER_SWEEP_TIMEOUT_MS).catch(err => {
    if (!/not found|no such network/i.test(String(err))) throw err
  })
}

/** Every run network on this machine of this site's namespace. */
export async function listRunNetworks(): Promise<string[]> {
  const { stdout } = await dockerWithin([
    'network', 'ls',
    '--filter', `label=${agentNetworkLabel()}=${NETWORK_KIND}`,
    '--filter', `label=com.docker.compose.project=${resolveComposeProjectName()}`,
    ...siteIdFilterArgs(),
    '--format', '{{.Name}}',
  ], DOCKER_SWEEP_TIMEOUT_MS)
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}
