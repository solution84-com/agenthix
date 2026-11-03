/**
 * What every operation of the host service works with: its state folder, the names derived from the recorded
 * namespace, Docker, hq's control socket and the machine it runs on. Built once at start (main.ts); tests build
 * it with a fake Docker and a temporary state folder.
 */
import type { Docker } from '../docker/docker'
import type { ContainerOps } from '../docker/containers'
import type { HqControl } from '../hq/control'
import type { HqSettings, MachinePaths, SiteSettings } from '../compose/projects'
import type { StateFolder } from '../state/folder'
import type { InstallNames } from '../state/namespace'
import { readInstallation } from '../state/installation'
import type { Installed } from '../status/machineStatus'
import type { SignatureCheck } from '../images/signatures'
import type { Signer } from '../images/published'
import type { RegistryEnv } from '../images/registryAuth'
import type { PreviewProbes } from '../previews/previewProbes'
import type { FrontDoorProbes, PortInUse } from '../frontDoor/probes'
import type { BackupIO } from '../backups/io'
import type { TagLister } from '../upgrades/versions'
import type { PlatformDigest } from '../upgrades/unchangedSince'
import type { LinkHandle } from '../link/link'
import type { Dial } from '../link/socket'

/** Where the state folder is mounted inside it. */
export const STATE_MOUNT = '/state'

export type Context = {
  state: StateFolder
  names: InstallNames
  docker: Docker
  /** The host service's own container and its launcher (ADR-0118). */
  containers: ContainerOps
  hqControl: HqControl
  machine: { name: string; hostServiceVersion: string }
  /** Checks a published image's signature against the one signer expected for it (cosign; tests stand in a fake). */
  signatures: (ref: string, signer: Signer) => Promise<SignatureCheck>
  /** The registry credential's client configuration for the pull, when this machine has one (images/registryAuth.ts). */
  registryEnv?: () => RegistryEnv | undefined
  /** Where the state folder is on the machine, for bind mounts; asked of Docker once. */
  machinePaths: () => Promise<MachinePaths | null>
  /** Why the site could not read the machine's figures (the volume is not mounted); null when it can. */
  figuresWarning: string | null
  sleep: (ms: number) => Promise<void>
  now: () => Date
  /** How long install waits for HQ to answer, and for its site to connect. */
  waits: { hqMs: number; siteMs: number; pollMs: number }
  /** What the front door asks of the machine (its certificates); the machine's own when absent. */
  frontDoorProbes?: FrontDoorProbes
  /** What the preview address's checks ask of the machine (DNS, the relay's answer); the machine's own when absent. */
  previewProbes?: PreviewProbes
  /** Whether a port is held on the machine, for the port check; a bind probe on the machine when absent. */
  portInUse?: PortInUse
  /** What backing up and restoring asks of Docker and of the folders the machine admin names. */
  backupIO: BackupIO
  /** Lists an image repository's published tags; the registry's own anonymous API when absent. */
  registryTags?: TagLister
  /** The platform image an image index lists for this machine; the registry's own anonymous API when absent. */
  registryPlatformDigest?: PlatformDigest
  /** The link to HQ's relay while a Fleet Console is pinned (`link/link.ts`); absent where nothing runs it. */
  link?: LinkHandle
  /** How the link and a join dial HQ's port; Node's WebSocket when absent. */
  dial?: Dial
  /** Whether anything answers at HQ's address; a plain request to it when absent. */
  reach?: (address: string) => Promise<boolean>
  /** The machine's own IPv4 addresses with their prefixes, which no install network may overlap; the machine's when absent. */
  machineAddresses?: () => string[]
}

export type StoredHq = HqSettings & { installedAt: string }
export type StoredSite = SiteSettings & { installedAt: string }

export function installed(ctx: Context): Installed {
  const hq = ctx.state.readJson('hq', 'settings.json') as StoredHq | null
  const site = ctx.state.readJson('site', 'settings.json') as StoredSite | null
  const port = hq ? readInstallation(ctx.state)?.ports.hq ?? null : null
  return {
    hq: hq ? { settings: hq, file: ctx.state.path('hq', 'compose.json'), project: ctx.names.hqProject, port } : null,
    site: site ? { settings: site, file: ctx.state.path('site', 'compose.json'), project: ctx.names.siteProject } : null,
  }
}

/** Asks Docker where `/state` comes from on the machine, once, and keeps the answer. */
export function machinePathsFrom(docker: Docker, hostContainer: string, override?: string): () => Promise<MachinePaths | null> {
  let known: MachinePaths | null = override ? { state: override } : null
  return async () => {
    if (known) return known
    const source = await docker.mountSource(hostContainer, STATE_MOUNT).catch(() => null)
    if (source) known = { state: source }
    return known
  }
}
