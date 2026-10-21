/**
 * `agenthix uninstall`, what it refuses and what it would remove: everything the install made on this machine, each
 * found by the name its recorded namespace gives it (`state/namespace.ts`). It never deletes what an erase would keep:
 * while HQ or a site is on the machine — running or suspended — it is refused, and what an erase left in the bin goes
 * only once the person types its name, as an erase asks for it. The backup location is the person's own and is never
 * touched; nor is the host service's own image, which its last step still runs from.
 *
 * `uninstallSteps.ts` removes it.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { HostTarget } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd, product } from '../cli/words'
import { BackupStore } from '../backups/store'
import { consoleHere } from '../install/console'
import { readPin } from '../link/pin'
import { enrolledWithCloud } from '../link/cloudController'
import { awaitingSite } from '../move/record'
import { FRONT_DOOR_IMAGE, frontDoorProject } from '../frontDoor/config'
import { isDevelopmentBuild } from '../images/images'
import { POSTGRES_IMAGE, PUBLISHED_PARTS, TRUSTED_PUBLISHERS } from '../images/published'
import type { ImageRow } from '../docker/removal'
import { protectionsTablePresent } from '../protections/protections'
import { tableFor } from '../protections/rules'
import { helperName } from '../launcher/uninstall'
import { binEntries } from './bin'
import { suspended } from './suspend'

export type Binned = { target: HostTarget; name: string; erasedAt: string; purgeAfter: string; location: string | null }

export type UninstallPlan = {
  machine: string
  /** What an erase left in the bin, still within its grace period: it blocks unless its name is typed. */
  binned: Binned[]
  fleetConsole: boolean
  /** Whether this machine answers a Fleet Console elsewhere, which is told it left. */
  leavesFleet: boolean
  agentContainers: number
  firewallTable: string | null
  volumes: string[]
  networks: string[]
  images: string[]
  /** The host service's containers, its own last. */
  hostContainers: string[]
  /** Where the state folder is on the machine; null when Docker does not say. */
  stateFolder: string | null
  backupsOnMachine: number
  exports: number
  backupLocation: string | null
  /** The host service's own image, by a short id the person can remove it by afterwards. */
  hostImage: string | null
}

/** The compose projects and groups an install can leave containers in, each found by its label. */
export const installProjects = (ctx: Context) =>
  [ctx.names.consoleProject, ctx.names.agentsProject, ctx.names.siteProject, ctx.names.hqProject, frontDoorProject(ctx.names)]

export const installVolumes = (ctx: Context) => {
  const n = ctx.names
  return [n.hqDbVolume, n.hqStorageVolume, n.siteDbVolume, n.consoleStateVolume, n.frontDoorDataVolume, n.frontDoorConfigVolume, n.hostFiguresVolume]
}

export const installNetworks = (ctx: Context) => {
  const n = ctx.names
  return [n.consoleNetwork, n.siteNetwork, n.edgeNetwork, n.hqNetwork, n.hqLinkNetwork]
}

/** The host service's other containers, removed by the service itself; its own goes last, by the helper. */
export const otherHostContainers = (ctx: Context) => [ctx.names.previousHostContainer, ctx.names.launcherContainer, helperName(ctx.names)]

const PUBLISHED_REPOSITORIES = new Set(TRUSTED_PUBLISHERS.flatMap(p => PUBLISHED_PARTS.map(part => `${p.registry}/${p.imagePrefix}-${part}`)))
const PINNED_THIRD_PARTY = [POSTGRES_IMAGE, FRONT_DOOR_IMAGE].map(ref => {
  const [repository, digest] = ref.replace(/:[^/:@]+@/, '@').split('@')
  return { repository, digest }
})

/**
 * The images this machine fetched for an install: the published ones, of any version, and the database's and the
 * front door's, by their digests. A development build fetched none — it runs images built on the machine, which are
 * the developer's — so it removes none. An image any container still uses is left by Docker itself.
 */
export function fetchedImages(rows: ImageRow[], hostServiceVersion: string): string[] {
  if (isDevelopmentBuild(hostServiceVersion)) return []
  const refs = rows.flatMap(row => {
    const ours = PUBLISHED_REPOSITORIES.has(row.repository)
      || PINNED_THIRD_PARTY.some(p => p.repository === row.repository && p.digest === row.digest)
    if (!ours) return []
    if (row.digest) return [`${row.repository}@${row.digest}`]
    return row.tag && row.tag !== '<none>' ? [`${row.repository}:${row.tag}`] : []
  })
  return [...new Set(refs)]
}

const inside = (child: string, parent: string) => {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Refuses, in words, while anything an uninstall must not remove is on the machine. */
export async function uninstallRefusal(ctx: Context): Promise<void> {
  const { hq, site } = installed(ctx)
  const machine = ctx.machine.name
  const pause = suspended(ctx)
  const kept = 'Erasing it keeps a final backup for 30 days.'
  if (hq) {
    throw new Refusal('conflict', `Not uninstalled: HQ at ${hq.settings.address} is on ${machine}${pause.hq ? ', suspended' : ''}. Nothing was removed. ${kept} Erase it first: ${cmd('hq erase')}`)
  }
  if (site) {
    throw new Refusal('conflict', `Not uninstalled: the site ${site.settings.name} is on ${machine}${pause.site ? ', suspended' : ''}. Nothing was removed. ${kept} Erase it first: ${cmd('site erase')}`)
  }
  if (awaitingSite(ctx.state)) {
    throw new Refusal('conflict', `Not uninstalled: a site is moving to ${machine}. Nothing was removed. Wait for the move to end, or a fleet admin to cancel it.`)
  }
  if (enrolledWithCloud(ctx.state)) {
    throw new Refusal('conflict', `Not uninstalled: ${product} Cloud runs ${machine}, so it is taken off through Cloud. Nothing was removed.`)
  }
  // One that came with HQ goes with it; one installed here from HQ's code may be the fleet's own.
  const fleetConsole = consoleHere(ctx)
  if (fleetConsole && !fleetConsole.settings.onHqMachine) {
    throw new Refusal('conflict', `Not uninstalled: the Fleet Console runs on ${machine}, and removing it deletes its keys. Nothing was removed. ` +
      `To keep the fleet's, move it first: on HQ's machine, ${cmd('hq console-code')}. One HQ no longer lets in goes with: ${cmd('console remove')}`)
  }
  const location = new BackupStore(ctx.state).location()
  const folder = (await ctx.machinePaths())?.state
  if (location && folder && inside(location.path, folder)) {
    throw new Refusal('conflict', `Not uninstalled: the backup location, ${location.path}, is inside the state folder, which goes. Nothing was removed. Choose a backup location outside it first: ${cmd('backup location <path>')}`)
  }
}

export function binnedEntries(ctx: Context): Binned[] {
  return binEntries(ctx).map(e => ({
    target: e.target,
    name: e.target === 'hq' ? e.hqAddress ?? '' : e.siteName,
    erasedAt: e.erasedAt,
    purgeAfter: e.purgeAfter,
    location: e.location?.path ?? null,
  }))
}

const count = (dir: string, keep: (name: string) => boolean = () => true) => {
  try {
    return fs.readdirSync(dir).filter(keep).length
  } catch {
    return 0
  }
}

export async function uninstallPlan(ctx: Context): Promise<UninstallPlan> {
  await uninstallRefusal(ctx)
  const removal = ctx.docker.removal()
  const [volumes, networks, rows] = await Promise.all([removal.volumes(), removal.networks(), removal.images()])
  const agents = await removal.group(ctx.names.agentsProject)
  const agentNetworks = await removal.groupNetworks(ctx.names.agentsProject)
  const host = await ctx.containers.inspect(ctx.names.hostContainer).catch(() => null)
  const others: string[] = []
  for (const name of otherHostContainers(ctx)) if (await ctx.containers.inspect(name).catch(() => null)) others.push(name)
  const table = tableFor(ctx.names.namespace)
  const store = new BackupStore(ctx.state)
  return {
    machine: ctx.machine.name,
    binned: binnedEntries(ctx),
    fleetConsole: !!consoleHere(ctx),
    leavesFleet: !!readPin(ctx.state) && !readPin(ctx.state)?.local,
    agentContainers: agents.length,
    firewallTable: (await protectionsTablePresent(table)) ? table : null,
    volumes: installVolumes(ctx).filter(v => volumes.includes(v)),
    networks: [...installNetworks(ctx).filter(n => networks.includes(n)), ...agentNetworks],
    images: fetchedImages(rows, ctx.machine.hostServiceVersion),
    hostContainers: [...others, ...(host ? [ctx.names.hostContainer] : [])],
    stateFolder: (await ctx.machinePaths())?.state ?? null,
    backupsOnMachine: (await store.list()).length,
    exports: count(ctx.state.path('exports')),
    backupLocation: store.location()?.path ?? null,
    hostImage: host ? host.image.replace(/^sha256:/, '').slice(0, 12) : null,
  }
}
