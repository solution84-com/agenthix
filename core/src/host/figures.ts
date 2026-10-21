/**
 * What a host service reports about its machine (host-management spec §6, §8): versions, health, uptime, resource
 * use, capacity and the protections in place. Figures only — nothing here names the organisation's people,
 * projects, agents or work, which is what lets the Cloud controller read them (spec §4).
 *
 * The same figures answer `figures.read` from a controller and are what the figures socket serves to the site the
 * machine runs. Type aliases, not interfaces, so hq can return them through Wasp operations.
 */

export type HostTarget = 'hq' | 'site'

/**
 * The machine's ceilings for agent containers (spec §8): memory, processors and processes per container, and how
 * many run at once. The host service holds them; the site applies them when it starts a container.
 */
export type HostCeilings = {
  memoryBytesPerContainer: number
  /** Processors per container; fractional, as Docker's `--cpus` takes it. */
  cpusPerContainer: number
  processesPerContainer: number
  containersAtOnce: number
}

/** A ceiling a narrower may set; an absent or null field leaves the machine's value in place. */
export type CeilingNarrowing = { [K in keyof HostCeilings]?: number | null }

/**
 * What a run gets: for each ceiling, the smallest of the machine's value and every narrowing (hq's, then the
 * project's). Narrowing never raises a ceiling — a value above the machine's is ignored, as is a value that is not
 * a positive number.
 */
export function narrowCeilings(machine: HostCeilings, ...narrowings: (CeilingNarrowing | null | undefined)[]): HostCeilings {
  const out = { ...machine }
  for (const n of narrowings) {
    if (!n) continue
    for (const key of Object.keys(out) as (keyof HostCeilings)[]) {
      const v = n[key]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < out[key]) out[key] = v
    }
  }
  return out
}

/** The ceilings a site reports to hq with its capacity figures: what it applies, and where each value came from. */
export type EffectiveCeilings = {
  ceilings: HostCeilings
  /** The machine's own values, before hq narrowed them. */
  machine: HostCeilings
}

export type ProtectionRule = 'machine-ports' | 'published-ports' | 'metadata-address'

/**
 * The agent protections (spec §8). They have no settings, so the figures say only whether they hold: which rules
 * are in place, when they were last checked, and in a sentence why not when they do not.
 */
export type ProtectionFigures = {
  holding: boolean
  rules: ProtectionRule[]
  checkedAt: string
  /** Why they do not hold, in words a person reads; null while they hold. */
  problem: string | null
}

export type InstallState = 'running' | 'stopped' | 'suspended' | 'starting' | 'upgrading' | 'failed' | 'erased'

/** One thing the host service runs — hq, or the site — and how it is doing. */
export type InstallFigures = {
  target: HostTarget
  version: string
  state: InstallState
  /** Since when it has been in this state (ISO). */
  since: string
  healthy: boolean
  /** The cause of a problem in a sentence, as hq shows it (spec §10); null while healthy. */
  problem: string | null
}

export type BackupFigures = {
  /** When the last nightly backup finished (ISO); null before the first. */
  lastNightlyAt: string | null
  lastNightlyOk: boolean | null
  /** Whether a backup location is set. Its path is shown only on the machine itself. */
  locationSet: boolean
  lastCopyAt: string | null
  lastExportAt: string | null
  /** The fleet's backup time, `HH:MM` in the machine's time zone. */
  nightlyAt: string
}

export type FrontDoorFigures = {
  on: boolean
  /** The earliest certificate expiry among those the front door holds (ISO); null when it holds none. */
  certificateExpiresAt: string | null
  renewalProblem: string | null
}

export type ResourceUse = {
  cpuLoad: number
  memory: { usedBytes: number; totalBytes: number }
  disk: { freeBytes: number; totalBytes: number }
}

export type HostFigures = {
  takenAt: string
  machine: {
    /** The machine's own name, as the host service reports it — separate from its site's (spec §6). */
    name: string
    system: string
    dockerVersion: string | null
    hostServiceVersion: string
    upSince: string
  }
  resources: ResourceUse
  ceilings: HostCeilings
  protections: ProtectionFigures
  installs: InstallFigures[]
  backups: BackupFigures
  frontDoor: FrontDoorFigures
  scheduledChanges: number
}

function positive(v: unknown, integer: boolean): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  return integer && !Number.isInteger(v) ? null : v
}

/** Ceilings as they came off a socket or the wire, checked; null unless every one is a positive number. */
export function parseHostCeilings(data: unknown): HostCeilings | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const memoryBytesPerContainer = positive(d.memoryBytesPerContainer, true)
  const cpusPerContainer = positive(d.cpusPerContainer, false)
  const processesPerContainer = positive(d.processesPerContainer, true)
  const containersAtOnce = positive(d.containersAtOnce, true)
  if (!memoryBytesPerContainer || !cpusPerContainer || !processesPerContainer || !containersAtOnce) return null
  return { memoryBytesPerContainer, cpusPerContainer, processesPerContainer, containersAtOnce }
}

/** The effective ceilings a site reports, checked; null when either set is not ceilings or the applied exceed the machine's. */
export function parseEffectiveCeilings(data: unknown): EffectiveCeilings | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const ceilings = parseHostCeilings(d.ceilings)
  const machine = parseHostCeilings(d.machine)
  if (!ceilings || !machine) return null
  for (const key of Object.keys(machine) as (keyof HostCeilings)[]) if (ceilings[key] > machine[key]) return null
  return { ceilings, machine }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Whether a value has the figures' outline, for a controller keeping what a pinned host service answered: its
 * signature says who sent it, this that it is figures and not some other answer.
 */
export function isHostFigures(v: unknown): v is HostFigures {
  if (!isObject(v) || typeof v.takenAt !== 'string' || !isObject(v.machine) || typeof v.machine.name !== 'string') return false
  return isObject(v.resources) && parseHostCeilings(v.ceilings) !== null && isObject(v.protections) &&
    Array.isArray(v.installs) && isObject(v.backups) && isObject(v.frontDoor)
}
