/**
 * The installation's record (one port plan, Rule 5): what this host service chose for everything it runs — its
 * namespace, the ports it publishes on the machine, and its agents' address block — in `installation.json`, and on
 * every container it runs as labels, which another installation's host service reads before it publishes anything.
 *
 * The namespace is written once, at the host service's first start, from `INSTALL_NAMESPACE` on its `docker run` or
 * the branding module's default; from then on every name the host service creates or looks for on the machine is
 * derived from the record, never from the code's branding or the environment, so a later rename cannot break an
 * install. The ports and the agent block are filled in by the commands that choose them, and read back by every
 * operation after.
 */
import type { InstallNamespace } from '@agenthix/core'
import type { StateFolder } from './folder'
import { namesFor, VALID_NAMESPACE, type InstallNames } from './namespace'

const FILE = 'installation.json'

export type InstallationPorts = { hq: number | null; console: number | null }

export type Installation = {
  namespace: InstallNamespace
  /** Published on the machine; null until the command that installs that part chose it. */
  ports: InstallationPorts
  /** The agents' address block; null until a site is installed and given one. */
  agentRange: string | null
  recordedAt: string
  /**
   * Set by `install --demo` (adr-0186) and kept from then on: hq and the site run with `DEMO_MODE`, the site without
   * the Docker socket, and no Fleet Console. Absent on every other installation.
   */
  demo?: true
}

const isPort = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535
const portOrNull = (v: unknown) => (v === null || v === undefined ? null : isPort(v) ? v : undefined)

function parse(raw: unknown, file: string): Installation {
  const r = raw as Partial<Record<keyof Installation, unknown>> | null
  const ports = (r?.ports ?? {}) as Partial<Record<keyof InstallationPorts, unknown>>
  const hq = portOrNull(ports.hq)
  const fleetConsole = portOrNull(ports.console)
  const agentRange = r?.agentRange ?? null
  if (!r || typeof r.namespace !== 'string' || !VALID_NAMESPACE.test(r.namespace) || hq === undefined || fleetConsole === undefined
    || (agentRange !== null && typeof agentRange !== 'string') || typeof r.recordedAt !== 'string'
    || (r.demo !== undefined && r.demo !== true)) {
    throw new Error(`${file} does not hold an installation the host service reads; it is left as it is.`)
  }
  return { namespace: r.namespace, ports: { hq, console: fleetConsole }, agentRange, recordedAt: r.recordedAt, ...(r.demo ? { demo: true as const } : {}) }
}

/** The installation recorded in `state`; null before the host service has first started. Throws when it is unreadable. */
export function readInstallation(state: StateFolder): Installation | null {
  const raw = state.readJson(FILE)
  return raw === null ? null : parse(raw, state.path(FILE))
}

/** The recorded namespace, without recording one; null before the first start, or when the record is unreadable. */
export function recordedNamespace(state: StateFolder): InstallNamespace | null {
  try {
    return readInstallation(state)?.namespace ?? null
  } catch {
    return null
  }
}

/** Refused at the first start, with nothing recorded: the host service cannot go on. */
export class InstallationRefused extends Error {}

export type FirstStart = {
  /** `INSTALL_NAMESPACE` from the host service's environment, when its `docker run` set it. */
  asked: string | undefined
  /** The namespace when none is asked: the branding module's default. */
  fallback: InstallNamespace
  /**
   * The name Docker gives this host service's own container; null when it cannot be told (no Docker socket, or not
   * in a container), and then the name is not checked.
   */
  ownName: () => Promise<string | null>
  now?: Date
}

const HOST_SUFFIX = /^([a-z][a-z0-9-]{0,30})-host$/

/** Why the container's name does not fit the namespace, in the words the refusal says. */
export function nameMismatch(own: string, ns: InstallNamespace): string | null {
  const needed = namesFor(ns).hostContainer
  if (own === needed) return null
  const fits = HOST_SUFFIX.exec(own)?.[1]
  const fix = fits && fits !== ns
    ? `To run another installation, set INSTALL_NAMESPACE=${fits} and keep the name ${own}.`
    : `Start it again named ${needed}, or set INSTALL_NAMESPACE=<name> and name its container <name>-host.`
  return `This host service's container is ${own}, but its namespace would be ${ns}, whose container is ${needed}. ${fix} Nothing was recorded.`
}

/**
 * The installation at the host service's start: read back when recorded, else recorded now — only once the namespace
 * is one Docker takes and the host service's own container carries the name it finds itself by (`<namespace>-host`).
 */
export async function startInstallation(state: StateFolder, start: FirstStart): Promise<Installation> {
  const asked = start.asked?.trim() || undefined
  const recorded = readInstallation(state)
  if (recorded) {
    if (asked && asked !== recorded.namespace) {
      throw new InstallationRefused(`This state folder is the installation ${recorded.namespace}'s, but INSTALL_NAMESPACE says ${asked}. ` +
        `Start it with INSTALL_NAMESPACE=${recorded.namespace}, or with a state folder of its own. Nothing was changed.`)
    }
    return recorded
  }
  const ns = asked ?? start.fallback
  if (!VALID_NAMESPACE.test(ns)) {
    throw new InstallationRefused(`"${ns}" cannot be an installation's namespace: it is lower-case letters, digits and hyphens, ` +
      'starting with a letter, at most 31 of them. Nothing was recorded.')
  }
  const own = await start.ownName()
  const mismatch = own === null ? null : nameMismatch(own, ns)
  if (mismatch) throw new InstallationRefused(mismatch)
  const installation: Installation = {
    namespace: ns, ports: { hq: null, console: null }, agentRange: null, recordedAt: (start.now ?? new Date()).toISOString(),
  }
  state.writeJson([FILE], installation)
  return installation
}

/** The recorded installation, which every operation after the first start has. */
export function installationOf(state: StateFolder): Installation {
  const installation = readInstallation(state)
  if (!installation) throw new Error(`${state.path(FILE)} is missing: the host service records it at its first start.`)
  return installation
}

/** Records the ports a command chose, keeping the rest of the record as it is. */
export function recordPorts(state: StateFolder, ports: Partial<InstallationPorts>): Installation {
  const before = installationOf(state)
  const installation: Installation = { ...before, ports: { ...before.ports, ...ports } }
  state.writeJson([FILE], installation)
  return installation
}

/** Records the agents' address block a site's first install chose, keeping the rest of the record as it is. */
export function recordAgentRange(state: StateFolder, agentRange: string): Installation {
  const installation: Installation = { ...installationOf(state), agentRange }
  state.writeJson([FILE], installation)
  return installation
}

/**
 * Records whether this installation is a demo, keeping the rest of the record as it is. Only a first install sets it
 * (`install.ts`): from then on every command keeps it.
 */
export function recordDemo(state: StateFolder, demo: boolean): Installation {
  const installation: Installation = { ...installationOf(state) }
  delete installation.demo
  if (demo) installation.demo = true
  state.writeJson([FILE], installation)
  return installation
}

/** Whether this installation is a demo; false before the first start, and when the record cannot be read. */
export function isDemoInstallation(state: StateFolder): boolean {
  try {
    return readInstallation(state)?.demo === true
  } catch {
    return false
  }
}

/** The ports the installation publishes on the machine, in the order its label lists them. */
export function publishedPorts(installation: Installation): number[] {
  return [installation.ports.hq, installation.ports.console].filter((p): p is number => p !== null)
}

/**
 * The labels every container the installation runs carries, which another installation's check reads: its published
 * ports, comma-separated, and its agents' block once it has one. A label with nothing to say is left out.
 */
export function installationLabels(names: Pick<InstallNames, 'label'>, installation: Installation): Record<string, string> {
  const ports = publishedPorts(installation)
  return {
    ...(ports.length ? { [names.label('ports')]: ports.join(',') } : {}),
    ...(installation.agentRange ? { [names.label('agent-range')]: installation.agentRange } : {}),
    // Read by a front door another installation runs, which serves a demo's files as downloads (frontDoor/neighbours.ts).
    ...(installation.demo ? { [names.label('demo')]: 'true' } : {}),
  }
}
