/**
 * The host service (host-management spec §6, adr-0107): the one authority over this machine. On start it makes
 * its state folder private, records the installation (its namespace, at the first start), and opens its two
 * sockets — the owner socket for the CLI, and the figures socket for the site it runs. It runs until Docker stops
 * its container.
 */
import { DEFAULT_INSTALL_NAMESPACE } from '@agenthix/core'
import fs from 'node:fs'
import { FIGURES_MOUNT, FIGURES_SOCKET, OWNER_SOCKET, STATE_DIR, cloudSettings, machineName } from './config'
import { startCloud } from './cloud/start'
import { cloudOperation } from './cloud/dispatch'
import { resumeRemoteAccess } from './remoteAccess/handlers'
import { Docker, DockerStreams, dockerCli, dockerStream } from './docker/docker'
import { Containers, containerIdIn } from './docker/containers'
import { collectFigures } from './figures/figures'
import { figuresHandler } from './figures/socket'
import { HqControl } from './hq/control'
import { ownerHandler } from './owner/dispatch'
import { installed, machinePathsFrom, type Context } from './service/context'
import { PRIVATE, SHARED, listen } from './sockets/lineServer'
import { StateFolder } from './state/folder'
import { namesFor } from './state/namespace'
import { readInstallation, startInstallation } from './state/installation'
import { figuresVolumeWarning } from './figures/mount'
import { checkSignature, cosignCli } from './images/signatures'
import { registryEnv } from './images/registryAuth'
import { DEVELOPMENT, ownVersion } from './images/ownVersion'
import { machineStatus } from './status/machineStatus'
import { Firewall, nftCli } from './protections/firewall'
import { machineRules } from './protections/machine'
import { readPublicAddresses, recordPublicAddress } from './protections/publicAddress'
import { AgentProtections, publicAddressRecorded, useProtections } from './protections/protections'
import { dockerBackupIO } from './backups/io'
import { startNightlyBackups } from './backups/nightly'
import { startHeldExportSweep } from './backups/exportDownload'
import { startScheduler } from './scheduled/scheduler'
import { startUpgrades } from './upgrades/automatic'
import { DOCKER_SOCKET, recordHostContainer } from './launcher/record'
import { afterSwitch } from './launcher/start'
import { noticesForSite } from './scheduled/notices'
import { startBinPurge } from './lifecycle/bin'
import { noteFiguresRead } from './lifecycle/siteTold'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { hostKeys } from './identity/identity'
import { HostAddressFollower } from './link/addressFollow'
import { followSiteAddress } from './install/siteAddress'
import { HostLink } from './link/link'
import { envelopeHandler } from './link/envelopes'
import { forgetConsole } from './link/manage'
import { startLeavingNotices } from './link/leaving'
import { keepLocalConsoleJoined } from './link/localConsole'
import { dialWebSocket } from './link/socket'
import { controllerOperation } from './owner/controller'
import { readPin } from './link/pin'
import { sealEnvelope } from '@agenthix/core/host-crypto'
import { deliver, setTransferWire } from './move/wire'
import { moveEndedHeard, receiveMoves, settleAfterRestart } from './move/receive'
import { awaitsMoveCode, moveCodeAnswered } from './move/code'
import { sayStopping } from './link/stopping'
import { reportBlockedAfterStart } from './status/portsBlocked'

function readMountInfo(): string {
  try {
    return fs.readFileSync('/proc/self/mountinfo', 'utf8')
  } catch {
    return ''
  }
}

async function main(): Promise<void> {
  const state = new StateFolder(STATE_DIR)
  state.prepare()
  const containers = new Containers(dockerCli)
  // Once, before anything serves: the version its container was started as, its signature checked (images/ownVersion.ts).
  // The CLI asks it on the owner socket, and the launcher reads what it recorded, so neither checks again.
  const version = await ownVersion({
    containers, state, mountinfo: readMountInfo(), hasDocker: fs.existsSync(DOCKER_SOCKET), now: () => new Date(),
    check: (ref, signer) => checkSignature(cosignCli, ref, signer, registryEnv(state, process.env)),
  })
  // At the first start, recorded only once its own container carries the name it finds itself by (`<namespace>-host`).
  const installation = await startInstallation(state, {
    asked: process.env.INSTALL_NAMESPACE,
    fallback: DEFAULT_INSTALL_NAMESPACE,
    ownName: async () => {
      const id = containerIdIn(readMountInfo())
      return id ? (await containers.inspect(id).catch(() => null))?.name ?? null : null
    },
  })
  const names = namesFor(installation.namespace)
  const docker = new Docker(dockerCli)
  const ctx: Context = {
    state,
    names,
    docker,
    containers,
    hqControl: new HqControl(docker, names.container('hq-server')),
    machine: { name: machineName(state), hostServiceVersion: version },
    signatures: (ref, signer) => checkSignature(cosignCli, ref, signer, registryEnv(state, process.env)),
    registryEnv: () => registryEnv(state, process.env),
    machinePaths: machinePathsFrom(docker, names.hostContainer, process.env.HOST_STATE_ON_MACHINE),
    figuresWarning: figuresVolumeWarning(readMountInfo(), FIGURES_MOUNT, names.hostFiguresVolume),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: () => new Date(),
    waits: { hqMs: 10 * 60_000, siteMs: 3 * 60_000, pollMs: 3_000 },
    backupIO: dockerBackupIO(new DockerStreams(dockerCli, dockerStream, names.hostContainer), state),
  }
  // This machine's own keys, made once, before anything can ask for them (spec §6).
  await hostKeys(state)
  // A Fleet Console's envelopes, along the one outward connection to HQ's relay (spec §4 C3).
  const link: HostLink = new HostLink({
    state,
    dial: dialWebSocket,
    onEnvelope: envelopeHandler({
      state,
      keys: () => hostKeys(state),
      replay: new EnvelopeReplayGuard(),
      operate: (request, by, pin) => controllerOperation(ctx, request, by, pin),
      send: envelope => link.sendEnvelope(envelope),
      now: () => Date.now(),
      log: line => console.warn(line),
      onMessage: message => (message.kind === 'moveEnded' ? moveEndedHeard(ctx, message) : moveCodeAnswered(message)),
      awaitsMoveCode,
    }),
    onTransfer: (type, payload) => deliver(ctx, type, payload),
    onRevoke: async () => {
      await forgetConsole(ctx)
      console.warn('HQ says this machine was disconnected in the Fleet Console: it no longer answers it.')
    },
    onHqAddress: address => follower.take(address),
    // Live previews are kept from the public address hq sees this machine from; a new one is written at once.
    onSeenFrom: address => { if (recordPublicAddress(state, address, new Date())) publicAddressRecorded() },
    log: line => console.warn(line),
  })
  // hq moving to a new address: this machine follows once the address passes the move check (spec §13).
  const follower = new HostAddressFollower({
    state, redial: () => { link.stop(); link.start() }, now: () => new Date(), log: line => console.warn(line),
    followed: (from, to) => followSiteAddress(ctx, from, to),
  })
  ctx.link = link
  // A site's move passes between two machines over this same link (spec §13; move/).
  setTransferWire(ctx, {
    send: (type, payload) => link.sendTransfer(type, payload),
    toConsole: async message => {
      const pin = readPin(state)
      if (pin) link.sendEnvelope(await sealEnvelope({ sender: await hostKeys(state), recipient: pin.console, message }))
    },
    replay: new EnvelopeReplayGuard(),
  })
  await settleAfterRestart(ctx).catch(err => console.warn(`A move this machine was taking in could not be cleared: ${err instanceof Error ? err.message : String(err)}`))
  receiveMoves(ctx, () => readPin(state))
  link.start()
  // Agenthix Cloud's controller, on a machine Cloud runs: its own link, never through hq. Nothing without its address.
  const cloud = startCloud({
    state, settings: cloudSettings(), keys: () => hostKeys(state), machineName: ctx.machine.name,
    dial: dialWebSocket, operate: request => cloudOperation(ctx, request), log: line => console.warn(line),
    now: () => new Date(), sleep: ctx.sleep,
  })
  follower.resume()
  // Remote access Cloud turned on: ends it if its time passed while stopped, else sets its timer again.
  resumeRemoteAccess(ctx)
  const stopLocalConsole = keepLocalConsoleJoined(ctx, 60_000, line => console.warn(line))
  // A machine that disconnected itself while HQ did not answer tells HQ it left once HQ does (spec §6).
  const stopLeaving = startLeavingNotices(state, 60_000, line => console.warn(line))
  const protections = new AgentProtections(new Firewall(nftCli), machineRules(
    names.namespace, () => readInstallation(state)?.agentRange ?? null, undefined, () => readPublicAddresses(state),
  ))
  useProtections(protections)
  const stopProtections = protections.start(undefined, line => console.log(line))
  const owner = await listen(OWNER_SOCKET, PRIVATE, ownerHandler(ctx))
  // The site reads the scheduled changes' notices with the figures and passes them up to hq (spec §14).
  const figures = await listen(FIGURES_SOCKET, SHARED, figuresHandler(async () => {
    // An erased site's machine waits for one such read to know HQ heard the site has gone (spec §15).
    noteFiguresRead(ctx)
    return { ...(await collectFigures(ctx)), scheduledNotices: noticesForSite(ctx) }
  }))
  const stopScheduler = startScheduler(ctx, 15_000, line => console.warn(line))
  // Finishes an upgrade a restart cut short, and schedules fixes for the maintenance window (spec §11).
  const stopUpgrades = startUpgrades(ctx, line => console.warn(line))
  console.log(`Host service ${version} on ${ctx.machine.name}: namespace ${names.namespace}, owner socket ${OWNER_SOCKET}, figures socket ${FIGURES_SOCKET}.`)
  if (ctx.figuresWarning) console.warn(ctx.figuresWarning)
  // The settings this container runs with, so the launcher can start it again from a new image (adr-0118).
  void recordHostContainer(ctx.containers, state, ctx.now(), names.hostContainer).then(r => {
    if ('problem' in r && version !== DEVELOPMENT) console.warn(`The host service cannot switch itself to a new version: ${r.problem}.`)
  }, () => {})
  void afterSwitch(ctx).then(s => {
    if (s && (s.phase === 'failed' || s.phase === 'refused') && s.endedAt && Date.now() - Date.parse(s.endedAt) < 3600_000) console.warn(`Host service switch to ${s.to}: ${s.reason}`)
  }, () => {})

  // hq cannot hear why its own site is not connected; reading the machine's status passes the cause on (spec §10).
  const relay = setInterval(() => {
    machineStatus(ctx.machine, installed(ctx), docker, ctx.hqControl).catch(() => {})
  }, 60_000)

  // After a reboot, a part whose published port another program took first cannot start: the log says so (Rule 4).
  const stopBlocked = reportBlockedAfterStart(ctx, line => console.warn(line))
  const stopBackups = startNightlyBackups(ctx)
  const stopHeldExports = startHeldExportSweep(ctx)
  const stopPurge = startBinPurge(ctx, undefined, line => console.warn(line))

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    // Its Fleet Console reads a deliberate stop as one, not as a machine gone silent; bounded well inside Docker's grace.
    await sayStopping({ state, keys: () => hostKeys(state), link })
    stopLocalConsole()
    stopLeaving()
    follower.stop()
    link.stop()
    cloud?.stop()
    stopBackups()
    stopHeldExports()
    stopPurge()
    clearInterval(relay)
    stopBlocked()
    stopUpgrades()
    stopScheduler()
    stopProtections()
    owner.close()
    figures.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void stop())
  process.on('SIGINT', () => void stop())
}

main().catch(err => {
  console.error(`The host service could not start: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
