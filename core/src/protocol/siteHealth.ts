/**
 * A site's health: what it reports about itself so an admin can see whether it
 * can do its work — runs now against the most it takes at once, disk free
 * where its project files are kept, whether Docker answers, and whether the
 * agent image is there.
 *
 * Sent as the one-way site event `site.health`: when the control channel
 * opens, then every `SITE_HEALTH_INTERVAL_MS`.
 *
 * It carries the site's effective ceilings (`ceilings`, host-management spec
 * §8, §10): what each agent container gets and how many run at once, and the
 * machine's values before hq narrowed them. Ceilings only — the machine's
 * resource use and Docker's version that the host service's figures carry stay
 * on the machine.
 *
 * It reports the executor image too (workflows spec part 1, *Image upgrades*): the digest workflow steps start from,
 * the release it came with and the content key of its tools stage, which together decide whether an approval
 * survives an upgrade. Added in site protocol 1.5; a site from before reports none.
 *
 * It also says whether the machine is nearly out of memory (`memoryNearlyFull`), a condition and never a figure, so
 * hq can warn the members whose work runs there (spec §10).
 *
 * hq treats every field as a claim from the network: `parseSiteHealth` is the
 * one place a report is checked before it is stored or shown.
 *
 * Type aliases, not interfaces: hq returns this through Wasp operations, whose
 * payload type needs an implicit index signature.
 */

import { parseEffectiveCeilings, type EffectiveCeilings } from '../host/figures.js'

export const SITE_HEALTH_EVENT = 'site.health'

/**
 * Once a minute. Each report runs three short Docker commands and one disk
 * query, which is negligible; and a minute is as stale as the Health section
 * and a "Docker is not running" notification ever get.
 */
export const SITE_HEALTH_INTERVAL_MS = 60_000

export type SiteHealth = {
  /** When the site took this report (ISO). */
  takenAt: string
  runs: {
    /** Runs executing now. */
    running: number
    /** The most this site runs at once (its `AGENT_MAX_CONCURRENT_RUNS`). */
    maxAtOnce: number
  }
  /** Where project files, workspaces and people's files are kept; null when the site could not read it. */
  disk: { freeBytes: number; totalBytes: number } | null
  docker: {
    running: boolean
    /** Docker's server version when it answers. */
    version: string | null
  }
  agentImage: {
    name: string
    present: boolean
    /** The release the site was started as, which is the release of the agent image it runs; null when the image is absent or the site was given no version. */
    version: string | null
  }
  /** The image workflow steps start from; absent when the site reports none (it is from before 1.5). */
  executorImage?: ExecutorImageReport | null
  /** What each agent container gets, and the machine's ceilings before narrowing; null when they cannot be trusted. */
  ceilings: EffectiveCeilings | null
  /** Whether the machine is nearly out of memory (`machineMemoryNearlyFull`). */
  memoryNearlyFull: boolean
  /** The disk the branches' working copies use (`clones/` across owners); absent from a site before 1.13, null when unreadable. Added in site protocol 1.13. */
  branchCopies?: { usedBytes: number } | null
}

export type ExecutorImageReport = {
  name: string
  present: boolean
  /** `sha256:…`: the image's published digest, or its image id for an image built on the machine; null when absent. */
  digest: string | null
  /** The release it came with; null when the site was given no version. */
  release: string | null
  /** The content key of the image's tools stage, shared with the agent image; null when the image carries none. */
  toolsKey: string | null
}

const GIB = 1024 ** 3

/**
 * Nearly full is less than 10 GiB free, or less than 10% of the disk on one
 * smaller than 100 GiB. A run that installs a project's dependencies or builds
 * it can take a few gigabytes, and several run at once; below this, the next
 * busy hour can fill the disk and fail runs part way.
 */
export function diskNearlyFull(disk: SiteHealth['disk']): boolean {
  if (!disk || disk.totalBytes <= 0) return false
  return disk.freeBytes < Math.min(10 * GIB, disk.totalBytes * 0.1)
}

/** Fleet admins are told when the disk is 80% used, which is earlier than nearly full: many branches of a large repository fill a machine. */
export const DISK_FILLING_PERCENT = 80

/** A warning already given holds until usage is below this, so a disk hovering at 80% is not warned of again and again. */
export const DISK_RECOVERED_PERCENT = 75

export function diskFilling(disk: SiteHealth['disk'], warned = false): boolean {
  if (!disk || disk.totalBytes <= 0) return false
  const percent = ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100
  return percent >= (warned ? DISK_RECOVERED_PERCENT : DISK_FILLING_PERCENT)
}

/**
 * Nearly out of memory is less than 1.5 GiB available, or less than 10% of a machine smaller than 15 GiB. 1.5 GiB
 * is one busy run's working set (the site's container limits are sized against it): below it, the next run that
 * builds or tests cannot fit, and the kernel kills a process — a run's, on this machine or another container's.
 * Available, not free: memory the kernel would give back from its caches counts as available.
 */
export function machineMemoryNearlyFull(memory: { availableBytes: number; totalBytes: number }): boolean {
  if (memory.totalBytes <= 0) return false
  return memory.availableBytes < Math.min(1.5 * GIB, memory.totalBytes * 0.1)
}

const MAX_TEXT = 200

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

function bytes(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const TOOLS_KEY_RE = /^[0-9A-Za-z._:-]{1,128}$/

function executorImageOf(v: unknown): ExecutorImageReport | null {
  const image = record(v)
  const name = text(image?.name)
  if (!image || !name || typeof image.present !== 'boolean') return null
  const digest = typeof image.digest === 'string' && DIGEST_RE.test(image.digest) ? image.digest : null
  const toolsKey = typeof image.toolsKey === 'string' && TOOLS_KEY_RE.test(image.toolsKey) ? image.toolsKey : null
  const present = image.present && digest !== null
  return { name, present, digest: present ? digest : null, release: present ? text(image.release) : null, toolsKey: present ? toolsKey : null }
}

/** A report as it came off the wire, checked field by field; null when it is not a health report. */
export function parseSiteHealth(data: unknown): SiteHealth | null {
  const d = record(data)
  const runs = record(d?.runs)
  const docker = record(d?.docker)
  const image = record(d?.agentImage)
  if (!d || !runs || !docker || !image) return null
  const takenAt = typeof d.takenAt === 'string' && !Number.isNaN(Date.parse(d.takenAt)) ? d.takenAt : null
  const running = count(runs.running)
  const maxAtOnce = count(runs.maxAtOnce)
  const name = text(image.name)
  if (!takenAt || running === null || maxAtOnce === null || !name) return null
  if (typeof docker.running !== 'boolean' || typeof image.present !== 'boolean') return null

  const executorImage = executorImageOf(d.executorImage)
  const disk = record(d.disk)
  const freeBytes = bytes(disk?.freeBytes)
  const totalBytes = bytes(disk?.totalBytes)
  if (typeof d.memoryNearlyFull !== 'boolean') return null
  const copies = bytes(record(d.branchCopies)?.usedBytes)
  return {
    takenAt,
    runs: { running, maxAtOnce },
    disk: freeBytes !== null && totalBytes !== null && freeBytes <= totalBytes ? { freeBytes, totalBytes } : null,
    docker: { running: docker.running, version: text(docker.version) },
    agentImage: { name, present: image.present, version: text(image.version) },
    // Left out when not reported, so a report from before 1.5 reads as it did.
    ...(executorImage ? { executorImage } : {}),
    ceilings: parseEffectiveCeilings(d.ceilings),
    memoryNearlyFull: d.memoryNearlyFull,
    ...(copies !== null ? { branchCopies: { usedBytes: copies } } : {}),
  }
}
