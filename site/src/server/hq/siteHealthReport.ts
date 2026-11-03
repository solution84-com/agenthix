import { statfs } from 'node:fs/promises'
import os from 'node:os'
import { SITE_HEALTH_INTERVAL_MS, machineMemoryNearlyFull, type SiteHealth } from '@agenthix/core'
import { prisma } from '#db'
import { dockerWithin } from '../../agents/runtime/containerLifecycle'
import { maxConcurrentRuns } from '../../agents/runtime/AgentEngine'
import { siteCeilings } from '../../agents/runtime/containerLimits'
import { getStorageRoot } from '../storage/paths'
import { readMacAvailableBytes } from './macMemory'
import { branchCopiesReport } from './branchCopiesSize'
import { runtimeCheck } from './runtimeCheck'
import { executorImageReport } from './executorImageReport'
import { executorImageName } from '../../agents/runtime/agentImage'
import { livePreviewsCapacity } from '../livePreviews/livePreviewCapacity'

const IMAGE_VERSION_TIMEOUT_MS = 10_000

/** Starts reporting through `send`; returns the stop function. */
export type HealthReporter = (send: (health: SiteHealth) => void) => () => void

export type HealthDeps = {
  docker?: (args: string[]) => Promise<{ stdout: string; stderr: string }>
  countRunning?: () => Promise<number>
  disk?: (path: string) => Promise<{ freeBytes: number; totalBytes: number }>
  memory?: () => { availableBytes: number; totalBytes: number }
  now?: () => Date
  branchCopies?: () => Promise<{ usedBytes: number } | null>
  livePreviews?: () => Promise<SiteHealth['livePreviews'] | null>
}

/**
 * The machine's memory as this process sees it: the machine's own (or Docker Desktop's virtual machine's). Node's
 * figure is available memory on Linux but free pages alone on macOS, where a site runs from source in development.
 */
function machineMemory(): { availableBytes: number; totalBytes: number } {
  const available = os.platform() === 'darwin' ? readMacAvailableBytes() : null
  return { availableBytes: available ?? os.freemem(), totalBytes: os.totalmem() }
}

let memoryShort = false

/**
 * Whether the machine is nearly out of memory, held until a quarter more than the threshold is available again: memory
 * moves by the minute, and a condition that came and went with each report would warn the same people again and again.
 */
export function memoryCondition(memory: { availableBytes: number; totalBytes: number }): boolean {
  memoryShort = memoryShort
    ? machineMemoryNearlyFull({ availableBytes: memory.availableBytes / 1.25, totalBytes: memory.totalBytes })
    : machineMemoryNearlyFull(memory)
  return memoryShort
}

async function diskOf(path: string): Promise<{ freeBytes: number; totalBytes: number }> {
  const s = await statfs(path)
  // What an unprivileged process may still write, not the blocks root keeps back.
  return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
}

/**
 * This site's health (core's `SiteHealth`). Docker and the image come from the
 * same `runtimeCheck`, and the limit from the engine's own
 * reader, so the report cannot disagree with either. Never throws: each part
 * that cannot be read is reported as unknown, not as a failure of the report.
 */
export async function takeHealth(deps: HealthDeps = {}): Promise<SiteHealth> {
  const docker = deps.docker ?? ((args: string[]) => dockerWithin(args, IMAGE_VERSION_TIMEOUT_MS))
  const [check, running, disk] = await Promise.all([
    runtimeCheck({ docker }),
    (deps.countRunning ?? (() => prisma.agentRun.count({ where: { status: 'RUNNING' } })))().catch(() => 0),
    (deps.disk ?? diskOf)(getStorageRoot()).catch(() => null),
  ])
  const dockerRunning = check.containerRuntime === 'available'
  const executorImage = dockerRunning
    ? await executorImageReport(docker)
    : { name: executorImageName(), present: false, digest: null, release: null, toolsKey: null }
  return {
    takenAt: (deps.now ?? (() => new Date()))().toISOString(),
    runs: { running, maxAtOnce: maxConcurrentRuns() },
    disk,
    docker: { running: dockerRunning, version: dockerRunning ? check.detail : null },
    agentImage: {
      name: check.agentImage,
      present: check.imagePresent,
      // The agent image is the one of the site's own release, so the site's version is its version.
      version: check.imagePresent ? process.env.APP_VERSION || null : null,
    },
    executorImage,
    // The ceilings only: never the machine's resource use or Docker's version from the host service's figures.
    ceilings: siteCeilings(),
    // A condition, never a figure (spec §10).
    memoryNearlyFull: memoryCondition((deps.memory ?? machineMemory)()),
    branchCopies: await (deps.branchCopies ?? (() => branchCopiesReport(getStorageRoot())))(),
    ...await (deps.livePreviews ?? livePreviewsCapacity)().then(c => (c ? { livePreviews: c } : {}), () => ({})),
  }
}

/**
 * Reports health while the control channel is open: at once, then every
 * `SITE_HEALTH_INTERVAL_MS`. Returns the stop function. A report that fails
 * to send is simply dropped; the next one replaces it.
 */
export function startHealthReports(send: (health: SiteHealth) => void, deps: HealthDeps = {}): () => void {
  let stopped = false
  const report = () => {
    void takeHealth(deps).then((h) => { if (!stopped) send(h) }).catch(() => {})
  }
  report()
  const timer = setInterval(report, SITE_HEALTH_INTERVAL_MS)
  timer.unref?.()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
