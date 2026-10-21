/**
 * Whether a relay request came from the container its turn runs in (spec §6).
 *
 * Every agent container has a network of its own, whose only other member is
 * the site (containerNetwork.ts, ADR-0066), so its requests reach the site
 * from its own address on that network. The check compares the request's
 * source — the socket's peer, never a forwarded-for header — with that
 * address, read from Docker and kept per container. A mismatch reads the
 * address again (at most once a second), in case the container was recreated
 * under the same name, before it refuses.
 *
 * That holds wherever the site shares the container's network: a deployed
 * site (`SITE_CONTAINER_NAME`), and a site run on a Linux machine, which the
 * container reaches through its network's gateway. It cannot hold where
 * Docker runs in a virtual machine — Docker Desktop — and the site runs on
 * the host: every container's request then arrives from Docker's port
 * forwarder, from the host's own loopback address (measured: 127.0.0.1). So
 * there the check accepts a loopback source for any container, which proves
 * the request came from this machine and nothing about which container; the
 * token alone ties it to the turn.
 */
import { dockerWithin } from '../../agents/runtime/containerLifecycle'
import { agentNetworkName } from '../../agents/runtime/containerNetwork'

export type SourceCheck = (containerName: string, remoteAddress: string | undefined) => Promise<boolean>

const INSPECT_TIMEOUT_MS = 5_000
const REREAD_AFTER_MS = 1_000

const addresses = new Map<string, { address: string | null; readAt: number }>()
let forwarded: Promise<boolean> | null = null

/** `::ffff:10.0.0.3` and `10.0.0.3` are one address. */
export function normaliseAddress(address: string | undefined): string {
  if (!address) return ''
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

export function isLoopback(address: string): boolean {
  return address === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)
}

/** The container's address on its own agent network, or null when it has none. */
export async function readContainerAddress(containerName: string): Promise<string | null> {
  try {
    const { stdout } = await dockerWithin(['container', 'inspect', '--format', '{{json .NetworkSettings.Networks}}', containerName], INSPECT_TIMEOUT_MS)
    const networks = JSON.parse(stdout.trim() || '{}') as Record<string, { IPAddress?: string }>
    return networks[agentNetworkName(containerName)]?.IPAddress || null
  } catch {
    return null
  }
}

/** Whether containers' requests reach this site through a virtual machine's port forwarder. */
async function readForwarded(): Promise<boolean> {
  if (process.env.SITE_CONTAINER_NAME) return false
  if (process.platform !== 'linux') return true
  try {
    const { stdout } = await dockerWithin(['info', '--format', '{{.OperatingSystem}}'], INSPECT_TIMEOUT_MS)
    return /docker desktop/i.test(stdout)
  } catch {
    return false
  }
}

export type SourceCheckDeps = {
  containerAddress: (containerName: string) => Promise<string | null>
  forwardedByVm: () => Promise<boolean>
  now: () => number
}

const defaultDeps: SourceCheckDeps = {
  containerAddress: readContainerAddress,
  forwardedByVm: () => (forwarded ??= readForwarded()),
  now: Date.now,
}

export function createSourceCheck(deps: SourceCheckDeps = defaultDeps): SourceCheck {
  return async (containerName, remoteAddress) => {
    const source = normaliseAddress(remoteAddress)
    if (!source) return false
    const known = addresses.get(containerName)
    if (known?.address === source) return true
    if (!known || deps.now() - known.readAt >= REREAD_AFTER_MS) {
      const address = await deps.containerAddress(containerName)
      addresses.set(containerName, { address, readAt: deps.now() })
      if (address === source) return true
    }
    return isLoopback(source) && (await deps.forwardedByVm())
  }
}

export const checkRelaySource: SourceCheck = createSourceCheck()

export function resetRelaySourceForTests(): void {
  addresses.clear()
  forwarded = null
}
