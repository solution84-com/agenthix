/**
 * The Fleet Console's settings, all from its environment, which the host service sets when it starts the console's
 * container (host-management spec §7). Nothing here can make it listen anywhere but the machine's own loopback or,
 * in its container, its own Docker network, whose port Docker publishes to the machine's loopback only.
 */
import dns from 'node:dns/promises'
import path from 'node:path'
import { normalizeJoinCode } from '@agenthix/core'
import { hqAddressProblem, type ResolveAll } from './hq/addressPolicy'
import { listenInContainer, readNetworkView, type NetworkView } from './net/containerNetwork'

/** Where the Fleet Console listens outside a container: it exposes nothing to the network (spec §4, §7). */
export const CONSOLE_LISTEN_HOST = '127.0.0.1'
/** `CONSOLE_LISTEN_HOST=container`: in its container, on its own network's address (net/containerNetwork.ts). */
export const IN_CONTAINER = 'container'
export const CONSOLE_DEFAULT_PORT = 4300

export type ConsoleConfig = {
  stateDir: string
  listenHost: string
  /** In its container, its network's gateway: the one peer it accepts besides the loopback. Null outside one. */
  containerGateway: string | null
  port: number
  /** hq's address, as the console dials it. */
  hqAddress: string
  /** On hq's machine: the pairing secret set at install (C8). */
  pairingSecret: string | null
  /** Elsewhere: the one-time code from `hq console-code`, redeemed once for a lasting credential. */
  hqCode: string | null
  version: string
}

export class ConfigError extends Error {}

export type ConfigSources = { network?: () => NetworkView; resolve?: ResolveAll }

/**
 * Reads the configuration, refusing what would expose the console or send a secret in the clear.
 * `CONSOLE_LISTEN_HOST` is 127.0.0.1 or `container`; any other value fails loudly rather than being ignored.
 */
export async function loadConfig(env: NodeJS.ProcessEnv, version: string, sources: ConfigSources = {}): Promise<ConsoleConfig> {
  const asked = env.CONSOLE_LISTEN_HOST?.trim() || CONSOLE_LISTEN_HOST
  if (asked !== IN_CONTAINER) assertLoopbackListen(asked)
  const port = env.CONSOLE_PORT ? Number(env.CONSOLE_PORT) : CONSOLE_DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`CONSOLE_PORT is not a port: ${env.CONSOLE_PORT}`)

  const hqAddress = env.CONSOLE_HQ_ADDRESS?.trim()
  if (!hqAddress) throw new ConfigError("CONSOLE_HQ_ADDRESS is not set: the Fleet Console needs hq's address to dial.")
  const pairingSecret = env.HQ_CONSOLE_PAIRING_SECRET?.trim() || null
  const hqCode = env.CONSOLE_HQ_CODE?.trim() || null
  if (hqCode && !normalizeJoinCode(hqCode)) throw new ConfigError('CONSOLE_HQ_CODE is not a one-time code: twelve letters and digits.')
  const resolve = sources.resolve ?? resolveAll
  const problem = await hqAddressProblem(hqAddress, { onHqMachine: pairingSecret !== null, ...(sources.resolve ? { resolve } : {}) })
  if (problem) throw new ConfigError(problem)

  let listenHost = CONSOLE_LISTEN_HOST
  let containerGateway: string | null = null
  if (asked === IN_CONTAINER) {
    let view: NetworkView
    try {
      view = (sources.network ?? readNetworkView)()
    } catch {
      throw new ConfigError('CONSOLE_LISTEN_HOST is container, but this is not a Linux container: it cannot read its network.')
    }
    const hqHost = new URL(hqAddress).hostname
    const listen = listenInContainer(view, await resolve(hqHost).catch(() => []))
    if (typeof listen === 'string') throw new ConfigError(`The Fleet Console does not start: ${listen}`)
    listenHost = listen.address
    containerGateway = listen.gateway
  }

  return { stateDir: env.CONSOLE_STATE_DIR?.trim() || '/state', listenHost, containerGateway, port, hqAddress, pairingSecret, hqCode, version }
}

const resolveAll: ResolveAll = async hostname => (await dns.lookup(hostname, { all: true })).map(r => r.address)

/** The control socket (control/socket.ts), in the state folder. */
export function controlSocketPath(env: NodeJS.ProcessEnv): string {
  return path.join(env.CONSOLE_STATE_DIR?.trim() || '/state', 'control.sock')
}

/** Throws unless the address is the machine's own IPv4 loopback, 127.0.0.1. */
export function assertLoopbackListen(host: string): void {
  if (host !== CONSOLE_LISTEN_HOST) {
    throw new ConfigError(
      `The Fleet Console listens only on ${CONSOLE_LISTEN_HOST} (or, in its container, on its own network: ${IN_CONTAINER}), never on ${host}: it is reached on its own machine or through an SSH tunnel.`,
    )
  }
}
