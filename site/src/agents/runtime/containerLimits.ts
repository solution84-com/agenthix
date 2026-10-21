/**
 * What one agent container is allowed to consume, and the environment-reading
 * rule its knobs share.
 *
 * A container belongs to one runner in one storage boundary (ADR-0074), and
 * runs in it are no longer queued behind each other (ADR-0075): one person's
 * conversations, and the project's own tasks in the project's container, run
 * in it at the same time, each with its own harness process tree. So the
 * budget is several runs' working sets at once, not one. What bounds how many
 * is the site-wide run cap (`AGENT_MAX_CONCURRENT_RUNS`, AgentEngine.ts,
 * default 5) — the most runs one container can ever hold at once — and the
 * defaults below are sized against that.
 *
 * Every value has an environment override, a default, and a stated reason for
 * the default's size. None is a measured optimum.
 *
 * THE FALLBACK RULE (site/.env.server.example states it for the idle window):
 * an override that is
 * not a usable value falls back to the default rather than reaching docker. `??`
 * alone is not enough, because it yields only on null or undefined — an empty
 * variable, which is what compose interpolates for an unset value and what a
 * bare `AGENT_CONTAINER_CPUS=` line produces, is a string, and docker refuses
 * it. Without this, one empty line fails every agent run on the site, in every
 * boundary, with an error that names none of that.
 */
import { narrowCeilings, type CeilingNarrowing, type EffectiveCeilings, type HostCeilings } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { hostFigures } from '../../server/host/hostFigures'

const logger = new Logger('AgentContainerManager')

export interface ContainerLimits {
  /** `--memory`. */
  memory: string
  /** `--pids-limit`. */
  pidsLimit: string
  /** `--cpus`. */
  cpus: string
}

/**
 * A positive number from the environment, or the default.
 *
 * Used by every container knob there is: the three limits below, the window
 * that bounds how long the end of a run waits on docker
 * (`AGENT_CONTAINER_ENDRUN_SECONDS`), and the
 * idle sweep's window (`AGENT_CONTAINER_IDLE_MINUTES`, server/setup.ts), which
 * had this rule first and kept an inline copy of it until this was written.
 * One implementation, so the rule cannot hold in one knob and quietly not in
 * the next — which is what a second copy of it leads to.
 *
 * `AGENT_CONTAINER_MEMORY` is the one knob not served from here, because it is
 * a docker size string rather than a number. It has its own validator, below,
 * for the same rule.
 *
 * Warns only when the variable is SET and unusable. A site that never sets it
 * is not misconfigured and should not say so on every container start.
 */
export function positiveNumberEnv(
  name: string,
  fallback: number,
  opts: { integer?: boolean } = {},
): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  const usable = Number.isFinite(parsed) && parsed > 0 && (!opts.integer || Number.isInteger(parsed))
  if (usable) return parsed
  logger.warn(
    `[container] ${name}=${JSON.stringify(raw)} is not a usable value — using ${fallback} instead`,
  )
  return fallback
}

/** A docker size string: a positive number with an optional b/k/m/g suffix. */
const MEMORY_PATTERN = /^\d+(?:\.\d+)?\s*[bkmg]?$/i

function memoryEnv(fallback: string): string {
  const raw = process.env.AGENT_CONTAINER_MEMORY
  if (raw === undefined) return fallback
  const trimmed = raw.trim()
  if (MEMORY_PATTERN.test(trimmed) && Number.parseFloat(trimmed) > 0) return trimmed
  logger.warn(
    `[container] AGENT_CONTAINER_MEMORY=${JSON.stringify(raw)} is not a docker size — using ${fallback} instead`,
  )
  return fallback
}

/**
 * What one agent container gets. On a machine a host service runs, its ceilings (host-management spec §8), each
 * narrowed by this site's own setting where one is set — never raised by it. Elsewhere, this site's own settings.
 */
export function resolveContainerLimits(host: HostCeilings | null = hostFigures.machineCeilings()): ContainerLimits {
  if (host) {
    const c = narrowCeilings(host, ownNarrowing())
    return { memory: `${Math.floor(c.memoryBytesPerContainer)}b`, pidsLimit: String(c.processesPerContainer), cpus: String(c.cpusPerContainer) }
  }
  return ownLimits()
}

function ownLimits(): ContainerLimits {
  return {
    // One run's working set peaks at roughly 1.5 GB — an estimate, not a
    // measurement: the harness CLI (a
    // Node process, a few hundred MB resident), the stdio servers it starts,
    // and the build or test run a turn most often does, which is where the
    // gigabyte goes. 4g held two of those; several conversations running in
    // one container at once would hit it and the kernel would kill whichever
    // process was largest — most likely another run's build. 8g holds four
    // runs at that peak, or five with the lighter turns most are. A ceiling,
    // not a reservation: a container using less costs nothing, and the limit
    // is still what stops one runner's container taking the whole host.
    memory: memoryEnv('8g'),
    // Counted in threads, not processes: `--pids-limit` is the cgroup's task
    // count, and a Node process alone is a dozen or more (V8's workers and
    // libuv's pool). A turn with a CLI, two stdio servers, a shell and a
    // parallel build or test runner reaches a few hundred; five of those
    // exceed 1,024, and exhausting the cap fails whichever run forks next
    // rather than the one that was extravagant. 4096 fits five runs with
    // room to spare while still stopping a runaway fork loop.
    pidsLimit: String(positiveNumberEnv('AGENT_CONTAINER_PIDS_LIMIT', 4096, { integer: true })),
    // Unchanged at two. Memory and processes fail a run when exhausted; CPU
    // only slows it, and an agent turn spends most of its time waiting on the
    // model rather than computing. Two lets an ordinary build parallelise
    // while one runner's container cannot starve every other container and
    // the site process streaming their output. Raised with
    // `AGENT_CONTAINER_CPUS` where runs in one container build a lot at once.
    cpus: String(positiveNumberEnv('AGENT_CONTAINER_CPUS', 2)),
  }
}

const UNIT: Record<string, number> = { '': 1, b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }

/** A docker size string in bytes, as docker reads it: binary units. */
export function dockerSizeBytes(size: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([bkmg]?)$/i.exec(size.trim())
  return m ? Math.floor(Number(m[1]) * UNIT[m[2].toLowerCase()]) : 0
}

/** The site-wide run cap, which bounds how many containers are busy at once (AgentEngine.ts). */
function ownRunsAtOnce(): number {
  return positiveNumberEnv('AGENT_MAX_CONCURRENT_RUNS', 5, { integer: true })
}

/** This site's settings that are set, as a narrowing of the host service's ceilings. */
function ownNarrowing(): CeilingNarrowing {
  const set = (name: string) => process.env[name] !== undefined
  const own = ownLimits()
  return {
    memoryBytesPerContainer: set('AGENT_CONTAINER_MEMORY') ? dockerSizeBytes(own.memory) : null,
    cpusPerContainer: set('AGENT_CONTAINER_CPUS') ? Number(own.cpus) : null,
    processesPerContainer: set('AGENT_CONTAINER_PIDS_LIMIT') ? Number(own.pidsLimit) : null,
    containersAtOnce: set('AGENT_MAX_CONCURRENT_RUNS') ? ownRunsAtOnce() : null,
  }
}

/**
 * The ceilings this site applies, as it reports them to hq (core's `EffectiveCeilings`): the machine's — the host
 * service's, or this site's own settings where no host service runs it — and what each run gets. hq and project
 * policy narrow nothing yet; when they do, their narrowing joins this site's here, through `narrowCeilings`.
 */
export function siteCeilings(host: HostCeilings | null = hostFigures.machineCeilings()): EffectiveCeilings {
  if (host) return { machine: host, ceilings: narrowCeilings(host, ownNarrowing()) }
  const own = ownLimits()
  const machine: HostCeilings = {
    memoryBytesPerContainer: dockerSizeBytes(own.memory),
    cpusPerContainer: Number(own.cpus),
    processesPerContainer: Number(own.pidsLimit),
    containersAtOnce: ownRunsAtOnce(),
  }
  return { machine, ceilings: machine }
}
