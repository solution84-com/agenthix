/**
 * Why a run failed, when it was for lack of resources (host-management spec §10, core's `runResource.ts`): its
 * container ran out of memory, the disk filled, or it reached the most processes a run may start. Before this
 * nothing noticed, and such a run ended with "The agent's process stopped unexpectedly."
 *
 * A container serves several runs (ADR-0075) and outlives each, so the kernel's own counters in the container's
 * control group tell what happened during one run: `oom_kill` in `memory.events` (a process killed for memory) and
 * `max` in `pids.events` (a fork refused at the process limit). They are read once when the run starts and again
 * when it fails; a rise between the two is this run's. A container that died is asked of Docker instead
 * (`State.OOMKilled`). A full disk shows in the error itself (`ENOSPC`), or in the site's own storage having no
 * room left.
 *
 * The counters are read inside the container, which the run's agent controls, so an agent could make its own run
 * read as one that ran out of memory. That changes only the words of its own failure and a notice to the people who
 * look after machines, at most once a day for each site and cause (hq's `runResourceNotice.ts`).
 */
import { statfs } from 'node:fs/promises'
import type { RunResourceShortage } from '@agenthix/core'
import { dockerWithin } from './containerLifecycle'
import { dockerSizeBytes, resolveContainerLimits } from './containerLimits'
import { getStorageRoot } from '../../server/storage/paths'

export type ContainerCounters = { oomKills: number; pidsRefused: number }

type Docker = (args: string[]) => Promise<{ stdout: string; stderr: string }>

export type CauseDeps = {
  docker?: Docker
  /** Free bytes where the site keeps project files and workspaces. */
  freeBytes?: () => Promise<number>
}

const READ_TIMEOUT_MS = 5_000

const defaultDocker: Docker = args => dockerWithin(args, READ_TIMEOUT_MS)

async function storageFree(): Promise<number> {
  const s = await statfs(getStorageRoot())
  return s.bavail * s.bsize
}

/** cgroup v2's files first, then v1's, whichever this machine has; the missing ones are skipped. */
const COUNTER_FILES = [
  '/sys/fs/cgroup/memory.events', '/sys/fs/cgroup/pids.events',
  '/sys/fs/cgroup/memory/memory.oom_control', '/sys/fs/cgroup/pids/pids.events',
]

/** The two counters out of the files' text; null when neither is there. */
export function parseCounters(text: string): ContainerCounters | null {
  const oom = /^oom_kill (\d+)$/m.exec(text)
  const pids = /^max (\d+)$/m.exec(text)
  if (!oom && !pids) return null
  return { oomKills: oom ? Number(oom[1]) : 0, pidsRefused: pids ? Number(pids[1]) : 0 }
}

/** The container's counters now; null when they cannot be read (the container is gone, or Docker does not answer). */
export async function readContainerCounters(containerName: string, docker: Docker = defaultDocker): Promise<ContainerCounters | null> {
  try {
    const { stdout } = await docker(['exec', containerName, 'sh', '-c', `cat ${COUNTER_FILES.join(' ')} 2>/dev/null; true`])
    return parseCounters(stdout)
  } catch {
    return null
  }
}

/** What Docker says of the container from outside it: whether it was killed for memory, and its two limits. */
async function inspect(containerName: string, docker: Docker): Promise<{ oomKilled: boolean; memory: number; pids: number } | null> {
  try {
    const { stdout } = await docker(['inspect', '--format', '{{.State.OOMKilled}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}}', containerName])
    const [oom, memory, pids] = stdout.trim().split(/\s+/)
    return { oomKilled: oom === 'true', memory: Number(memory) || 0, pids: Number(pids) || 0 }
  } catch {
    return null
  }
}

const DISK_FULL = /ENOSPC|no space left on device|disk quota exceeded/i
const PROCESS_LIMIT = /\b(fork|spawn|pthread_create|clone)\b[^\n]*(EAGAIN|resource temporarily unavailable)|EAGAIN[^\n]*\b(fork|spawn|pthread_create|clone)\b|cannot fork/i

/** Less than this free where the site keeps its files, and a failed run is put down to the disk. */
export const DISK_FULL_BYTES = 64 * 1024 ** 2

export type CauseInput = {
  error: string | null | undefined
  containerName: string | null
  /** The counters as the run started (`readContainerCounters`), when they were read. */
  baseline: Promise<ContainerCounters | null> | null
}

/** Why the run failed, when it was for lack of resources; null when it was something else, or cannot be told. */
export async function runResourceCause(input: CauseInput, deps: CauseDeps = {}): Promise<RunResourceShortage | null> {
  const docker = deps.docker ?? defaultDocker
  const message = input.error ?? ''
  if (DISK_FULL.test(message)) return { cause: 'disk', limit: null }

  let cause: 'memory' | 'processes' | null = null
  let facts: Awaited<ReturnType<typeof inspect>> = null
  if (input.containerName) {
    const [before, now] = await Promise.all([input.baseline ?? Promise.resolve(null), readContainerCounters(input.containerName, docker)])
    if (before && now) {
      if (now.oomKills > before.oomKills) cause = 'memory'
      else if (now.pidsRefused > before.pidsRefused) cause = 'processes'
    }
    if (!cause && !now) {
      facts = await inspect(input.containerName, docker)
      if (facts?.oomKilled) cause = 'memory'
    }
  }
  if (!cause && PROCESS_LIMIT.test(message)) cause = 'processes'
  if (!cause) {
    const free = await (deps.freeBytes ?? storageFree)().catch(() => null)
    return free !== null && free < DISK_FULL_BYTES ? { cause: 'disk', limit: null } : null
  }

  if (!facts && input.containerName) facts = await inspect(input.containerName, docker)
  const own = resolveContainerLimits()
  const limit = cause === 'memory'
    ? (facts?.memory || dockerSizeBytes(own.memory)) || null
    : (facts && facts.pids > 0 ? facts.pids : Number(own.pidsLimit)) || null
  return { cause, limit }
}
