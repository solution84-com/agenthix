/**
 * The install's recorded namespace (host-management spec §17). Recorded once, on the host service's first start,
 * from the branding module's current default; from then on every name the host service creates or looks for on
 * the machine — compose projects, containers, volumes, networks, labels, database names — is derived from the
 * record, never from the code's branding, so a later rename of the product cannot break an install.
 */
import type { InstallNamespace } from '@agenthix/core'
import type { StateFolder } from './folder'

const FILE = 'namespace.json'
/** Lowercase, as Docker requires of compose project names, and short enough to prefix every other name. */
const VALID = /^[a-z][a-z0-9-]{0,30}$/

export function recordNamespace(state: StateFolder, current: InstallNamespace, now = new Date()): InstallNamespace {
  const recorded = state.readJson(FILE)
  if (recorded !== null) {
    const ns = (recorded as { namespace?: unknown }).namespace
    if (typeof ns !== 'string' || !VALID.test(ns)) {
      throw new Error(`${state.path(FILE)} does not hold a namespace the host service reads; it is left as it is.`)
    }
    return ns
  }
  if (!VALID.test(current)) throw new Error(`"${current}" cannot be an install's namespace.`)
  state.writeJson([FILE], { namespace: current, recordedAt: now.toISOString() })
  return current
}

/** The namespace recorded in `state`, without recording one; null before the host service has first started. */
export function recordedNamespace(state: StateFolder): InstallNamespace | null {
  const ns = (state.readJson(FILE) as { namespace?: unknown } | null)?.namespace
  return typeof ns === 'string' && VALID.test(ns) ? ns : null
}

export type InstallNames = ReturnType<typeof namesFor>

/**
 * Every Docker name is `<namespace>-<part>[-<what>]`, the part being its image's own name; volumes and networks are
 * named explicitly, so compose adds no prefix of its own. Databases use underscores, as Postgres prefers.
 */
export function namesFor(ns: InstallNamespace) {
  const db = ns.replace(/-/g, '_')
  return {
    namespace: ns,
    hqProject: `${ns}-hq`,
    siteProject: `${ns}-site`,
    /** A container named after its part: `hq-server`, `hq-db`, `site-db`, `front-door`. */
    container: (part: string) => `${ns}-${part}`,
    siteContainer: `${ns}-site-server`,
    /**
     * The host service's own container, its launcher, and the name the replaced one is kept under during a switch.
     * The first is the documented `docker run`'s `--name`.
     */
    hostContainer: `${ns}-host`,
    launcherContainer: `${ns}-host-launcher`,
    previousHostContainer: `${ns}-host-previous`,
    /**
     * The groups of what is started with `docker run` rather than compose, carried as their
     * `com.docker.compose.project` label: the host service and its launcher, and the agents a site starts. The
     * agents never share the site's project, whose next `up --remove-orphans` would remove them mid-run.
     */
    hostProject: `${ns}-host`,
    agentsProject: `${ns}-agents`,
    /** The Fleet Console's compose project and container, on the machine that is its home (spec §7). */
    consoleProject: `${ns}-console`,
    consoleContainer: `${ns}-console`,
    /**
     * The Fleet Console's own network, which nothing else joins. Its name sorts before `hqLinkNetwork`'s, because
     * Docker takes a container's route out from the first of its networks by name, and on HQ's machine the Fleet
     * Console is on both: its port is published on this one, so the route out must be this one's (spec §7).
     */
    consoleNetwork: `${ns}-console`,
    hqNetwork: `${ns}-hq-internal`,
    siteNetwork: `${ns}-site-internal`,
    /** A front door on this machine joins this network to reach hq-web. */
    edgeNetwork: `${ns}-edge`,
    /** The private network hq's default site reaches hq over (spec §10). */
    hqLinkNetwork: `${ns}-hq-link`,
    hqDbVolume: `${ns}-hq-db-data`,
    hqStorageVolume: `${ns}-hq-storage`,
    siteDbVolume: `${ns}-site-db-data`,
    consoleStateVolume: `${ns}-console-state`,
    frontDoorDataVolume: `${ns}-front-door-data`,
    frontDoorConfigVolume: `${ns}-front-door-config`,
    /** The volume holding the figures socket, mounted into the host service and read-only into its site. */
    hostFiguresVolume: `${ns}-host-figures`,
    label: (key: string) => `${ns}.${key}`,
    hqDatabase: `${db}_hq`,
    siteDatabase: `${db}_site`,
  }
}
