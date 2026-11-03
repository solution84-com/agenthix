/**
 * The Fleet Console put together around a link to hq: its keys and pinned machines from the state folder, the
 * commands, joins and sessions, and the API. `main.ts` gives it the real link; the tests give it a fake one.
 */
import http from 'node:http'
import net from 'node:net'
import { EnvelopeReplayGuard, fingerprintOf } from '@agenthix/core/host-crypto'
import { Activity } from './activity'
import { RoleCheck } from './auth/roleCheck'
import { Sessions } from './auth/sessions'
import { Authenticators } from './auth/authenticators'
import { RemoteAccess } from './net/remoteAccess'
import { SignIn } from './auth/signIn'
import { assertLoopbackListen, ConfigError, CONSOLE_LISTEN_HOST } from './config'
import type { HqLink } from './hq/link'
import { HostCommands } from './hosts/commands'
import { Presence } from './hosts/presence'
import { FiguresRefresh } from './hosts/figuresRefresh'
import { Silence } from './hosts/silence'
import { HqFacts } from './hq/hqFacts'
import { HqFeatures, type AskFeatures } from './hq/hqFeatures'
import { createApp, type ConsoleContext } from './http/app'
import { CONTAINER_PEER, PUBLISHED_PORT, type ContainerPeer, type NetworkPeer } from './http/guards'
import type { NetworkView } from './net/containerNetwork'
import { CommandRuns } from './http/commandRuns'
import { Joins } from './join/joins'
import { Moves } from './move/moves'
import { HandoverIn } from './handover/incoming'
import { HandoverOut } from './handover/outgoing'
import { StateFolder } from './state/folder'
import { PinnedHosts } from './state/hosts'
import { loadOrCreateKeys } from './state/keys'

export type ConsoleOptions = {
  state: StateFolder
  link: HqLink
  machineName: string
  version: string
  commandTimeouts?: { short?: number; long?: number; staleRetry?: number }
  /** Tests pass a guard that began in the past; a real start refuses envelopes from before it (replay.ts). */
  replay?: EnvelopeReplayGuard
  /** The one-time code it was started with elsewhere (`CONSOLE_HQ_CODE`), normalised; it may be a handover code. */
  hqCode?: string | null
  /** In its container: its address on its own network and that network's gateway, the one peer besides the loopback. */
  containerPeer?: ContainerPeer | null
  /** The port it is published on, for the words that tell a person where to open it. */
  publishedPort?: number
  /** How to ask hq which flagged features are on: hq's `features.on` unless given; `null`, none is (hqFeatures.ts). */
  askFeatures?: AskFeatures | null
}

export async function createConsole(o: ConsoleOptions): Promise<{ ctx: ConsoleContext; app: http.RequestListener }> {
  o.state.prepare()
  const keys = await loadOrCreateKeys(o.state)
  const hosts = new PinnedHosts(o.state)
  const presence = new Presence(hosts)
  presence.attach(o.link)
  const commands = new HostCommands(keys, o.link, hosts, presence, o.replay ?? new EnvelopeReplayGuard(), o.commandTimeouts)
  const activity = new Activity(o.link)
  const silence = new Silence({ hosts, presence, link: o.link, state: o.state })
  commands.onStopping(fp => silence.stopped(fp))
  silence.start()
  const joins = new Joins({ keys, link: o.link, hosts, commands, presence, activity, version: o.version })
  const moves = new Moves({ link: o.link, hosts, commands, joins, presence, activity, state: o.state })
  const handoverOut = new HandoverOut({ keys, link: o.link, hosts, commands, activity, machineName: o.machineName })
  const handoverIn = new HandoverIn({ keys, link: o.link, hosts, commands, state: o.state, machineName: o.machineName }, o.hqCode ?? null)
  const sessions = new Sessions(o.state)
  const ctx: ConsoleContext = {
    link: o.link, hosts, presence, figures: new FiguresRefresh(hosts, presence, commands), hqFacts: new HqFacts(o.link),
    features: new HqFeatures(o.link, o.askFeatures === undefined ? () => o.link.call('features.on', {}) : o.askFeatures),
    commands, joins, moves, handoverOut, handoverIn, activity, sessions, silence,
    roles: new RoleCheck(o.link, sessions),
    signIn: new SignIn(o.link, activity, o.machineName),
    runs: new CommandRuns(),
    remoteAccess: new RemoteAccess({ state: o.state, activity, machineName: o.machineName, ended: () => sessions.endRemote() }),
    authenticators: new Authenticators(o.state),
    machineName: o.machineName,
    consoleFingerprint: await fingerprintOf(keys.identity),
    version: o.version,
  }
  const app = createApp(ctx)
  // guards.ts reads it from here; without it, only the loopback is let in.
  if (o.containerPeer) app.locals[CONTAINER_PEER] = o.containerPeer
  if (o.publishedPort !== undefined) app.locals[PUBLISHED_PORT] = o.publishedPort
  return { ctx, app }
}

/**
 * Listens on the loopback, or — in its container — on its own network's address and, on HQ's machine, its address on
 * HQ's link network, and nowhere else, and checks that is where it ended up. One HTTP server answers on both: a
 * connection to the second address is handed to it, and `peerAllowed` decides per connection which peer is let in.
 */
export async function listen(app: http.RequestListener, host: string, port: number, containerPeer: ContainerPeer | null = null): Promise<http.Server> {
  const expected = containerPeer ? containerPeer.address : CONSOLE_LISTEN_HOST
  if (containerPeer) assertContainerListen(host, containerPeer)
  else assertLoopbackListen(host)
  const server = http.createServer(app)
  server.headersTimeout = 20_000
  server.requestTimeout = 60_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address !== 'object' || address.address !== expected) {
    server.close()
    throw new ConfigError(`The Fleet Console ended up listening on ${JSON.stringify(address)}, not ${expected}; it stopped.`)
  }
  const bound = address.port
  try {
    for (const other of containerPeer?.also ?? []) {
      const extra = net.createServer(socket => server.emit('connection', socket))
      await new Promise<void>((resolve, reject) => {
        extra.once('error', reject)
        extra.listen(bound, other.address, () => { extra.off('error', reject); resolve() })
      })
      server.once('close', () => extra.close())
    }
  } catch (err) {
    server.close()
    throw err
  }
  return server
}

/**
 * The networks it is on besides its own, each by its address there and its gateway: Docker's default gateway of a
 * network whose subnet was given, which is the first address in it. Read from the container's interfaces; what
 * the request says never takes part.
 */
export function otherNetworks(view: NetworkView, own: NetworkPeer): NetworkPeer[] {
  const others: NetworkPeer[] = []
  for (const list of Object.values(view.interfaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address === own.address || a.address === '127.0.0.1') continue
      const mask = toInt(a.netmask)
      const gateway = fromInt(((toInt(a.address) & mask) >>> 0) + 1)
      if (gateway !== a.address) others.push({ address: a.address, gateway })
    }
  }
  return others
}

const toInt = (a: string) => a.split('.').reduce((n, o) => ((n << 8) | Number(o)) >>> 0, 0)
const fromInt = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

const UNSPECIFIED = new Set(['', '0.0.0.0', '::', '::0'])
const ADDRESS = /^\d{1,3}(\.\d{1,3}){3}$/

function assertContainerListen(host: string, peer: ContainerPeer): void {
  if (host !== peer.address || UNSPECIFIED.has(host) || !ADDRESS.test(host)) {
    throw new ConfigError(`The Fleet Console listens in its container only on its own network's address ${peer.address}, never on ${host || 'every address'}.`)
  }
  for (const other of peer.also ?? []) {
    if (UNSPECIFIED.has(other.address) || !ADDRESS.test(other.address)) {
      throw new ConfigError(`The Fleet Console listens in its container only on the addresses of the networks it is on, never on ${other.address || 'every address'}.`)
    }
  }
}
