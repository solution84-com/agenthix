/**
 * The machine's figures (host-management spec §6, §8): versions, health, uptime, resource use, capacity and the
 * protections — figures only, nothing of the organisation's people or work. What `figures.read` answers on both
 * sockets.
 */
import fs from 'node:fs'
import os from 'node:os'
import { parseHostCeilings } from '@agenthix/core'
import type { BackupFigures, HostCeilings, HostFigures, InstallFigures } from '@agenthix/core'
import { HQ_SERVICES, partState, SITE_SERVICES, type PartState } from '../status/machineStatus'
import { installed, STATE_MOUNT, type Context } from '../service/context'
import { protectionFigures } from '../protections/protections'
import { frontDoorFigures } from '../frontDoor/frontDoor'
import { previewsFigures } from '../previews/previewChecks'
import { scheduledCount } from '../scheduled/notices'
import { BackupStore } from '../backups/store'
import { blockedParts } from '../status/portsBlocked'

/** The machine's ceilings until a machine admin or fleet admin sets them: the site's own defaults today. */
export const DEFAULT_CEILINGS: HostCeilings = {
  memoryBytesPerContainer: 8 * 1024 ** 3,
  cpusPerContainer: 2,
  processesPerContainer: 4096,
  containersAtOnce: 5,
}

export function machineCeilings(ctx: Context): HostCeilings {
  const machine = ctx.state.readJson('machine.json') as { ceilings?: unknown } | null
  return parseHostCeilings(machine?.ceilings) ?? DEFAULT_CEILINGS
}

function installFigure(target: 'hq' | 'site', version: string, since: string, state: PartState): InstallFigures {
  const running = state === 'running'
  return {
    target,
    version,
    state: running ? 'running' : state === 'starting' ? 'starting' : 'stopped',
    since,
    healthy: running,
    problem: running ? null : state === 'starting' ? 'Not every part of it runs yet.' : 'It is not running.',
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** From the backup log the host service keeps (backups/store.ts). The location's path never leaves the machine. */
function backupFigures(ctx: Context): BackupFigures {
  const store = new BackupStore(ctx.state)
  const log = store.log()
  const time = store.time()
  return {
    lastNightlyAt: log.last?.at ?? null,
    lastNightlyOk: log.last ? log.last.ok : null,
    locationSet: store.location() !== null,
    lastCopyAt: log.copy?.ok ? log.copy.at : null,
    lastExportAt: log.lastExportAt ?? null,
    nightlyAt: `${pad(time.hour)}:${pad(time.minute)}`,
  }
}

function disk(): HostFigures['resources']['disk'] {
  try {
    const s = fs.statfsSync(STATE_MOUNT)
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
  } catch {
    return { freeBytes: 0, totalBytes: 0 }
  }
}

export async function collectFigures(ctx: Context): Promise<HostFigures> {
  const now = ctx.now()
  const { hq, site } = installed(ctx)
  const installs: InstallFigures[] = []
  if (hq) {
    const state = partState(await ctx.docker.composePs(hq.project, hq.file), HQ_SERVICES)
    const figure = installFigure('hq', hq.settings.version, hq.settings.installedAt, state)
    // What the Fleet Console shows of HQ: why it is not running, when another holds its port.
    const blocked = state === 'running' ? undefined : (await blockedParts(ctx)).find(b => b.part === 'hq')
    installs.push(blocked ? { ...figure, problem: blocked.text } : figure)
  }
  if (site) {
    const state = partState(await ctx.docker.composePs(site.project, site.file), SITE_SERVICES)
    installs.push(installFigure('site', site.settings.version, site.settings.installedAt, state))
  }
  const total = os.totalmem()
  return {
    takenAt: now.toISOString(),
    machine: {
      name: ctx.machine.name,
      system: `${os.type()} ${os.release()} (${os.arch()})`,
      dockerVersion: await ctx.docker.version(),
      hostServiceVersion: ctx.machine.hostServiceVersion,
      upSince: new Date(now.getTime() - os.uptime() * 1000).toISOString(),
    },
    resources: {
      cpuLoad: os.loadavg()[0] ?? 0,
      memory: { usedBytes: total - os.freemem(), totalBytes: total },
      disk: disk(),
    },
    ceilings: machineCeilings(ctx),
    protections: protectionFigures(now),
    installs,
    backups: backupFigures(ctx),
    frontDoor: await frontDoorFigures(ctx),
    ...withPreviews(ctx),
    scheduledChanges: scheduledCount(ctx),
  }
}

/** Live apps' preview address, on HQ's machine only. */
function withPreviews(ctx: Context): { previews?: ReturnType<typeof previewsFigures> } {
  const previews = previewsFigures(ctx)
  return previews ? { previews } : {}
}
