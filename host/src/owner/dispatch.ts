/**
 * The owner socket's one door (host-management spec §6): every request goes through `parseOwnerRequest`, and
 * only what it accepts reaches an operation. An operation of the closed set that this version does not do yet is
 * refused in words, never passed on.
 */
import type { HostActor, HostRefusal, HostRequest, LogLineFigure } from '@agenthix/core'
import type { Handler, Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { collectFigures } from '../figures/figures'
import { setCapacity } from '../figures/capacity'
import { protectionFigures } from '../protections/protections'
import { install } from '../install/install'
import { setFilesAddress } from '../install/filesAddress'
import { machineStatus } from '../status/machineStatus'
import { blockedParts } from '../status/portsBlocked'
import { unchangedSince } from '../upgrades/unchangedSince'
import { parseOwnerRequest, type OwnerRequest } from './requests'
import { cloudCliOperation } from './cloudCliOps'
import { providerCliOperation } from './providerCliOps'
import { Refusal, type HqLinkResult, type OwnerAnswer } from './results'
import { cmd } from '../cli/words'
import { frontDoorCheck, frontDoorSettings } from '../frontDoor/frontDoor'
import { frontDoorSet } from '../frontDoor/set'
import { frontDoorInstallation } from '../frontDoor/installations'
import { previewsSet } from '../previews/previewsSet'
import { backupOperation, machineBackupOperation } from '../backups/operations'
import { backupsStatus } from '../backups/status'
import { cancelScheduled, changeScheduled, listScheduled, scheduleChange } from '../scheduled/scheduler'
import { upgradesOperation } from '../upgrades/operations'
import { upgrade } from '../upgrades/upgrade'
import { upgradesStatus } from '../upgrades/status'
import { runNow } from '../lifecycle/changes'
import { restoreFromBin } from '../lifecycle/bin'
import { lifecycleStatus } from '../lifecycle/status'
import { consoleOperation } from './consoleOps'
import { linkStatus } from '../link/status'
import { moveHqAddress } from '../install/hqAddress'
import { pointSite } from '../install/siteAddress'
import { pointMachine } from '../link/pointMachine'
import { askHqMoveCode, askMoveCode } from '../move/code'
import { hqRecoverCheck, recoverHq } from '../move/hqRecover'
import { uninstallPlan } from '../lifecycle/uninstall'
import { uninstallRun } from '../lifecycle/uninstallSteps'
import { isDemoInstallation } from '../state/installation'
import { resetDemo } from '../demo/reset'
import { nextDemoReset } from '@agenthix/core'
import { CLOUD_NOT_AVAILABLE, cloudFeatureOn } from '../cloud/flag'

/** The owner socket is the CLI's, so whoever asks through it is the machine admin. */
const MACHINE_ADMIN = { kind: 'machineAdmin' } as const

const SERVICES = { hq: ['hq-db', 'hq-server', 'relay', 'hq-web'], site: ['site-db', 'site'] } as const

function opOf(data: unknown): string | null {
  const op = data && typeof data === 'object' ? (data as { op?: unknown }).op : undefined
  return typeof op === 'string' && op.length <= 64 ? op : null
}

const notYet = (): never => {
  throw new Refusal('failed', 'This version of the host service does not do that yet.')
}

function project(ctx: Context, target: 'hq' | 'site') {
  const found = installed(ctx)[target]
  if (!found) {
    throw new Refusal('not_installed', target === 'hq'
      ? `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`
      : `No site runs on ${ctx.machine.name}. To install HQ and its site here: ${cmd('install')}`)
  }
  return found
}

const LINK_KINDS = { first_admin: 'firstAccount', invitation: 'invitation', password_reset: 'passwordReset' } as const

async function hqLink(ctx: Context, command: 'invite-admin' | 'reset-password', args: string[]): Promise<HqLinkResult> {
  project(ctx, 'hq')
  const answer = await ctx.hqControl.link(command, args)
  if (!answer) throw new Refusal('failed', `HQ is not answering on this machine yet. See how it is doing: ${cmd('status')}`)
  if (!answer.ok) throw new Refusal(answer.notFound ? 'not_found' : 'failed', answer.error)
  const { data } = answer
  return {
    kind: LINK_KINDS[data.kind],
    link: data.link,
    validHours: data.validHours,
    person: data.kind === 'password_reset' ? data.person : null,
    toldAdmins: data.kind === 'first_admin' ? [] : data.toldAdmins,
  }
}

/** Compose's log lines, `<container> | <time> <message>`, as figures. */
export function logLines(out: string, names: Record<string, string>): LogLineFigure[] {
  const lines: LogLineFigure[] = []
  for (const raw of out.split('\n')) {
    const bar = raw.indexOf(' | ')
    if (bar < 0) continue
    const container = raw.slice(0, bar).trim()
    const rest = raw.slice(bar + 3)
    const space = rest.indexOf(' ')
    const at = space > 0 ? rest.slice(0, space) : ''
    lines.push({ at, service: names[container] ?? container, level: 'info', message: space > 0 ? rest.slice(space + 1) : rest })
  }
  return lines
}

/**
 * An operation of the closed set, for whoever asked it: the machine admin through the owner socket, or a fleet admin
 * through the pinned Fleet Console (`controller.ts`), who is named on what they schedule.
 */
export async function hostOperation(ctx: Context, request: HostRequest, progress: (p: Progress) => void, by: HostActor = MACHINE_ADMIN): Promise<unknown> {
  switch (request.op) {
    case 'figures.read':
      return collectFigures(ctx)
    case 'logs.read': {
      const p = project(ctx, request.target)
      const services: readonly string[] = SERVICES[request.target]
      if (request.service && !services.includes(request.service)) {
        throw new Refusal('malformed', `There is no part called ${request.service}; there are ${services.join(', ')}.`)
      }
      const names = Object.fromEntries(services.map(s => [s === 'site' ? ctx.names.siteContainer : ctx.names.container(s), s]))
      const out = await ctx.docker.composeLogs(p.project, p.file, Math.min(request.limit ?? 200, 5000), request.service, request.since)
      const since = request.since ? Date.parse(request.since) : NaN
      // Compose has already cut at `since`; a line without a readable time is kept rather than guessed at.
      const lines = logLines(out, names).filter(l => Number.isNaN(since) || !(Date.parse(l.at) < since))
      return { lines }
    }
    case 'install':
      if (request.target === 'site') {
        throw new Refusal('conflict', "This machine's site comes with HQ when HQ is installed here, or from a Fleet Console's code.")
      }
      if (request.version !== ctx.machine.hostServiceVersion) {
        throw new Refusal('conflict', `This host service installs version ${ctx.machine.hostServiceVersion}, not ${request.version}.`)
      }
      await install(ctx, { address: request.address, hqPort: request.hqPort, consolePort: request.consolePort }, progress)
      return { state: 'started' }
    case 'frontDoor.set':
      return frontDoorSet(ctx, request, by, progress)
    case 'previews.set':
      return previewsSet(ctx, request.domain, progress)
    case 'backup.take':
    case 'backup.list':
    case 'backup.export':
    case 'backup.exportRead':
    case 'backup.exportDone':
    case 'backup.store':
    case 'backup.fetch':
    case 'backup.restore':
      return backupOperation(ctx, request, progress)
    case 'start':
    case 'stop': {
      const p = project(ctx, request.target)
      if (request.op === 'start') await ctx.docker.composeStart(p.project, p.file)
      else await ctx.docker.composeStop(p.project, p.file)
      return { state: request.op === 'start' ? 'started' : 'stopped' }
    }
    case 'capacity.set':
      return setCapacity(ctx, request.ceilings)
    case 'address.set':
      return request.target === 'hq' ? moveHqAddress(ctx, request.address, progress) : pointSite(ctx, request.address, progress)
    case 'upgrade':
      return upgrade(ctx, request.target, request.version, progress)
    case 'schedule':
      return { change: await scheduleChange(ctx, request.change, request.at, by) }
    case 'schedule.change':
      return { change: await changeScheduled(ctx, request.changeId, request.at) }
    case 'schedule.cancel':
      return { change: await cancelScheduled(ctx, request.changeId) }
    case 'suspend':
    case 'resume':
      await runNow(ctx, request, by, progress)
      return { state: request.op === 'suspend' ? 'suspended' : 'started' }
    case 'erase': {
      const { erased } = await runNow(ctx, request, by, progress)
      return { purgeAfter: erased?.entry.purgeAfter ?? null, hqTold: erased?.hqTold ?? null, inLocation: !!erased?.entry.location?.names.includes(erased.entry.finalBackup) }
    }
    default:
      return notYet()
  }
}

async function operation(ctx: Context, request: OwnerRequest, progress: (p: Progress) => void, closed?: AbortSignal): Promise<unknown> {
  switch (request.op) {
    case 'console.connect':
    case 'console.disconnect':
    case 'console.install':
    case 'console.port':
    case 'console.remove':
    case 'hq.consoleCode':
    case 'hq.fleetAdmin':
      // A demo has no Fleet Console and no fleet admins: nothing in it reaches the machine from a browser (adr-0186).
      if (isDemoInstallation(ctx.state)) {
        throw new Refusal('conflict', 'This installation is a demo: it has no Fleet Console and no fleet admins, and it is managed only from this command line. Nothing was changed.')
      }
      return consoleOperation(ctx, request, progress, closed)
    case 'demo.reset':
      return resetDemo(ctx, request.confirmed === true, progress)
    case 'console.hqAddress':
      return pointMachine(ctx, request.address, progress)
    case 'site.moveCode':
      return askMoveCode(ctx, request.at)
    case 'hq.moveCode':
      return askHqMoveCode(ctx, request.at, request.hqAddress ?? null)
    case 'hq.moveRecoverCheck':
      return hqRecoverCheck(ctx)
    case 'hq.moveRecover':
      return recoverHq(ctx, request.confirmed === true)
    case 'machine.uninstallCheck':
      return uninstallPlan(ctx)
    case 'machine.uninstall':
      return uninstallRun(ctx, { confirmed: request.confirmed === true, purge: request.purge }, progress)
    case 'hq.cloudConnection':
    case 'console.resetCode':
      // Agenthix Cloud's, behind its flag (adr-0189); turning remote access off stays open, so it can always be closed.
      if (!cloudFeatureOn()) throw new Refusal('conflict', CLOUD_NOT_AVAILABLE)
      return cloudCliOperation(ctx, request)
    case 'console.remoteOff':
      return cloudCliOperation(ctx, request)
    case 'hq.provider':
      return providerCliOperation(ctx, request)
    case 'machine.status': {
      const door = frontDoorSettings(ctx)
      const status = { ...(await machineStatus(ctx.machine, installed(ctx), ctx.docker, ctx.hqControl)), protections: protectionFigures(ctx.now()), backups: backupsStatus(ctx), scheduled: listScheduled(ctx), upgrades: upgradesStatus(ctx), lifecycle: lifecycleStatus(ctx), management: await linkStatus(ctx), blocked: await blockedParts(ctx), unchangedSince: await unchangedSince(ctx) }
      const demo = isDemoInstallation(ctx.state) ? { demo: { nextResetAt: nextDemoReset(ctx.now()).toISOString() } } : {}
      return door ? { ...status, ...demo, frontDoor: { on: door.on, hosts: door.hosts } } : { ...status, ...demo }
    }
    case 'frontDoor.check':
      return frontDoorCheck(ctx, request.filesHost)
    case 'frontDoor.installation':
      return frontDoorInstallation(ctx, request.namespace, request.remove === true, progress)
    case 'scheduled.list':
      return { machine: ctx.machine.name, changes: listScheduled(ctx) }
    case 'host.version':
      return { version: ctx.machine.hostServiceVersion }
    case 'machine.install':
      return install(ctx, { address: request.address, hqPort: request.hqPort, consolePort: request.consolePort, demo: request.demo === true, filesHost: request.filesHost }, progress)
    case 'hq.filesAddress':
      return setFilesAddress(ctx, request.host, progress)
    case 'hq.inviteAdmin':
      return hqLink(ctx, 'invite-admin', [])
    case 'erased.restore':
      return restoreFromBin(ctx, request.target, progress)
    case 'hq.resetPassword':
      return hqLink(ctx, 'reset-password', [request.user])
    case 'backup.status':
    case 'backup.location':
    case 'backup.locationConfirm':
    case 'backup.saveKey':
    case 'backup.exportNow':
    case 'restore.list':
    case 'restore.check':
    case 'restore.run':
      return machineBackupOperation(ctx, request, progress)
    case 'upgrades.status':
    case 'upgrades.check':
    case 'upgrades.hostService':
    case 'upgrades.hostSwitch':
    case 'upgrades.set':
      return upgradesOperation(ctx, request)
    default:
      return hostOperation(ctx, request, progress)
  }
}

export function ownerHandler(ctx: Context): Handler {
  return async (data, progress, closed): Promise<OwnerAnswer> => {
    const parsed = parseOwnerRequest(data)
    if (!parsed.ok) return { ok: false, op: opOf(data), refusal: parsed.refusal }
    try {
      return { ok: true, op: parsed.request.op, result: await operation(ctx, parsed.request, progress, closed) }
    } catch (err) {
      if (err instanceof Refusal) return { ok: false, op: parsed.request.op, refusal: { code: err.code, message: err.message } }
      const refusal: HostRefusal = { code: 'failed', message: err instanceof Error ? err.message : String(err) }
      return { ok: false, op: parsed.request.op, refusal }
    }
  }
}
