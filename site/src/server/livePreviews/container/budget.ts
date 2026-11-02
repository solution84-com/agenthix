/**
 * One budget for a live preview's containers together (live preview spec section 5, *Each live preview has its own
 * ceiling*): memory, CPU, processes, disk and logs, the same as one agent container gets on this machine
 * (containerLimits.ts). When the copy declares services, its own container takes most of it and the services share
 * the rest (`LIVE_PREVIEW_SERVICES_SHARE`, a quarter by default), so the containers together never exceed it.
 *
 * Disk: the root is read-only, so what a container writes outside the copy is its two memory-backed folders (`/tmp`
 * and the commands' home); their sizes are its disk budget, and count against its memory as well.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { SERVICES_FILE } from '@agenthix/core'
import { dockerSizeBytes, positiveNumberEnv, resolveContainerLimits, type ContainerLimits } from '../../../agents/runtime/containerLimits'

export type LivePreviewBudget = { memoryBytes: number; cpus: number; pids: number; diskBytes: number; imageBytes: number; logBytes: number }

const MIB = 1024 ** 2
const GIB = 1024 ** 3
const IMAGE_BYTES_DEFAULT = 8 * GIB
const DISK_BYTES_DEFAULT = 1280 * MIB
const LOG_BYTES_DEFAULT = 30 * MIB
export const LOG_FILES = 3
const SERVICES_SHARE_DEFAULT = 0.25

export function livePreviewBudget(limits: ContainerLimits = resolveContainerLimits()): LivePreviewBudget {
  return {
    memoryBytes: dockerSizeBytes(limits.memory),
    cpus: Number(limits.cpus),
    pids: Number(limits.pidsLimit),
    diskBytes: positiveNumberEnv('LIVE_PREVIEW_DISK_BYTES', DISK_BYTES_DEFAULT, { integer: true }),
    imageBytes: positiveNumberEnv('LIVE_PREVIEW_IMAGE_BYTES', IMAGE_BYTES_DEFAULT, { integer: true }),
    logBytes: positiveNumberEnv('LIVE_PREVIEW_LOG_BYTES', LOG_BYTES_DEFAULT, { integer: true }),
  }
}

/** What `total` leaves once `used` is taken; null when any part of it is spent. The image cap is per image. */
export function budgetLeft(total: LivePreviewBudget, used: LivePreviewBudget[]): LivePreviewBudget | null {
  const sum = (k: keyof LivePreviewBudget) => used.reduce((n, b) => n + b[k], 0)
  const left: LivePreviewBudget = {
    memoryBytes: total.memoryBytes - sum('memoryBytes'),
    cpus: Math.round((total.cpus - sum('cpus')) * 100) / 100,
    pids: total.pids - sum('pids'),
    diskBytes: total.diskBytes - sum('diskBytes'),
    imageBytes: total.imageBytes,
    logBytes: total.logBytes - sum('logBytes'),
  }
  return Object.values(left).every(v => Number.isFinite(v) && v > 0) ? left : null
}

/** The two memory-backed folders, sized from the disk budget: four fifths for `/tmp`, the rest for the home. */
export function budgetTmpfs(budget: LivePreviewBudget): Record<string, string> {
  const tmp = Math.floor((budget.diskBytes * 4) / 5)
  return {
    '/tmp': `rw,exec,nosuid,nodev,size=${tmp},mode=1777`,
    '/home/agent': `rw,exec,nosuid,nodev,size=${budget.diskBytes - tmp},uid=1001,gid=1001,mode=0700`,
  }
}

export function budgetArgs(budget: LivePreviewBudget): string[] {
  return [
    '--memory', `${budget.memoryBytes}b`,
    '--memory-swap', `${budget.memoryBytes}b`,
    '--cpus', String(budget.cpus),
    '--pids-limit', String(budget.pids),
    '--log-driver', 'local',
    '--log-opt', `max-size=${Math.floor(budget.logBytes / LOG_FILES)}`,
    '--log-opt', `max-file=${LOG_FILES}`,
  ]
}

function share(total: LivePreviewBudget, part: number): LivePreviewBudget {
  return {
    memoryBytes: Math.floor(total.memoryBytes * part),
    cpus: Math.max(0.01, Math.floor(total.cpus * part * 100) / 100),
    pids: Math.floor(total.pids * part),
    diskBytes: Math.floor(total.diskBytes * part),
    imageBytes: total.imageBytes,
    logBytes: Math.floor(total.logBytes * part),
  }
}

/** The live preview's own container's part of `total`, and its services' part; together never more than `total`. */
export function splitBudget(total: LivePreviewBudget): { own: LivePreviewBudget; services: LivePreviewBudget } {
  const raw = positiveNumberEnv('LIVE_PREVIEW_SERVICES_SHARE', SERVICES_SHARE_DEFAULT)
  const services = share(total, raw < 1 ? raw : SERVICES_SHARE_DEFAULT)
  return {
    own: {
      memoryBytes: total.memoryBytes - services.memoryBytes,
      cpus: Math.round((total.cpus - services.cpus) * 100) / 100,
      pids: total.pids - services.pids,
      diskBytes: total.diskBytes - services.diskBytes,
      imageBytes: total.imageBytes,
      logBytes: total.logBytes - services.logBytes,
    },
    services,
  }
}

/** The copy's services file is there: a plain file in a plain folder, never through a link. */
export async function copyDeclaresServices(copy: string): Promise<boolean> {
  const folder = await fs.lstat(path.join(copy, path.dirname(SERVICES_FILE))).catch(() => null)
  if (!folder?.isDirectory()) return false
  return (await fs.lstat(path.join(copy, SERVICES_FILE)).catch(() => null))?.isFile() ?? false
}

/** By live preview: whether its container was made with a share left for services. */
const sharedWithServices = new Map<string, boolean>()

export async function ownContainerBudget(id: string, copy: string, total: LivePreviewBudget = livePreviewBudget()): Promise<LivePreviewBudget> {
  const shared = await copyDeclaresServices(copy)
  sharedWithServices.set(id, shared)
  return shared ? splitBudget(total).own : total
}

/** The services' share of the live preview's budget; null when its container holds the whole of it. */
export function servicesPool(id: string, total: LivePreviewBudget = livePreviewBudget()): LivePreviewBudget | null {
  return sharedWithServices.get(id) ? splitBudget(total).services : null
}

export function forgetBudget(id: string): void {
  sharedWithServices.delete(id)
}
