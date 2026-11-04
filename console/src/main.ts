/**
 * The Fleet Console's server (host-management spec §7, plan 3.7): on 127.0.0.1 only (the port is in
 * docs/architecture/ports.md) — in its container, on its own network, with the port published to the machine's
 * 127.0.0.1 — dialling out to hq and nothing else. The host
 * service starts it — on hq's machine at install, or elsewhere with `console install`.
 */
import { consoleCodeKind, normalizeJoinCode } from '@agenthix/core'
import { consoleCodeLookup } from '@agenthix/core/host-crypto'
import { controlSocketPath, loadConfig } from './config'
import { startControlSocket } from './control/socket'
import { consoleLinkUrl } from './hq/addressPolicy'
import { HqCredentials } from './hq/credentials'
import { ConsoleAddressFollower } from './hq/addressFollow'
import { WsHqLink } from './hq/wsLink'
import { createConsole, listen, otherNetworks } from './console'
import { readNetworkView } from './net/containerNetwork'
import { StateFolder } from './state/folder'

// Set by the host service when it starts the container (CONSOLE_VERSION); `dev` for a development build.
const VERSION = process.env.CONSOLE_VERSION || 'dev'

async function main(): Promise<void> {
  const config = await loadConfig(process.env, VERSION)
  const state = new StateFolder(config.stateDir)
  state.prepare()
  // hq is given only the code's lookup: a handover code must never reach it (handover/incoming.ts).
  const hqCode = config.hqCode ? normalizeJoinCode(config.hqCode) : null
  const credentials = new HqCredentials(state, config.pairingSecret, hqCode
    ? { lookup: await consoleCodeLookup(hqCode), kind: consoleCodeKind(hqCode) ?? 'handover' }
    : null)
  // hq may have moved since CONSOLE_HQ_ADDRESS was set, and this Fleet Console followed it (host-management spec §13).
  let link: WsHqLink | null = null
  const follower = new ConsoleAddressFollower({
    state, configured: config.hqAddress, onHqMachine: config.pairingSecret !== null, credential: () => credentials.lasting(),
    redial: address => link?.redial(consoleLinkUrl(address)), log: line => console.log(`[console] ${line}`),
  })
  link = new WsHqLink({ url: consoleLinkUrl(follower.current()), credentials })
  link.on('hqAddress', address => follower.take(address))
  const own = config.containerGateway ? { address: config.listenHost, gateway: config.containerGateway } : null
  const containerPeer = own ? { ...own, also: otherNetworks(readNetworkView(), own) } : null
  const { app, ctx } = await createConsole({
    state, link, version: config.version, hqCode, containerPeer, publishedPort: config.publishedPort,
    machineName: process.env.CONSOLE_MACHINE_NAME?.trim() || 'this machine',
  })
  const server = await listen(app, config.listenHost, config.port, containerPeer)
  // On a machine Cloud runs, remote access that was on before a restart comes back until its end (net/remoteAccess.ts).
  await ctx.remoteAccess.start(app, config.listenHost)
  const control = await startControlSocket(controlSocketPath(process.env), { ...ctx, hqAddress: follower })
  link.start()
  follower.resume()
  console.log(containerPeer
    ? `[console] Fleet Console ${VERSION} listening on ${config.listenHost}:${config.port} in its container, from the gateway of ${containerPeer.also?.length ? 'each network it is on' : 'its network'} only`
    : `[console] Fleet Console ${VERSION} listening on http://${config.listenHost}:${config.port}`)

  const stop = () => {
    follower.stop()
    link?.stop()
    control.close()
    void ctx.remoteAccess.stop()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

main().catch(err => {
  console.error(`[console] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
