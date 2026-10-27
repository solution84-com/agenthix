/**
 * The compose projects the host service writes into its state folder and runs (host-management spec §6): hq
 * (hq-db, hq-server, relay, hq-web) and its default site (site-db, site). Every stored name comes from the recorded
 * namespace; every image name from the branding module's `imageName`. Each image is the one install checked and
 * fetched (`images/images.ts`), fixed by its digest, and compose never fetches one itself (`pull_policy: never`).
 *
 * Written as JSON, which is YAML, so no value needs YAML quoting. Compose still interpolates `$` in every string,
 * so each is escaped as `$$` (`composeJson`).
 */
import { CLOUD_URL_SETTING, CONTAINER_DATABASE_PORT, SERVICE_PORTS } from '@agenthix/core'
import type { InstallNames } from '../state/namespace'
import type { ImagePins } from '../images/images'
import { imageRef, isPublishedVersion, POSTGRES_IMAGE, type PublishedPart } from '../images/published'
import type { InstallSecrets } from '../state/secrets'
import { cloudSettings, type CloudSettings } from '../config'
import { ipam, type InstallSubnets } from './subnets'
import { installationLabels, type Installation } from '../state/installation'

/** Where the host service's state folder is on the machine, which bind mounts must name (the CLI runs inside). */
export type MachinePaths = { state: string }

export type HqSettings = {
  address: string
  /**
   * The address hq-web is published on, on the machine. Its port is the installation's (`installation.json`), recorded
   * there alone.
   */
  bind: string
  /** How many proxies stand in front of hq-web: 1 with nothing in front, 2 behind a front door. */
  trustedProxies: number
  /** Uploaded files' own origin (adr-0114); null where HQ's address can have no subdomain, so uploads are downloads only. */
  filesOrigin?: string | null
  version: string
  /** What each image runs as, set when install checked its signature. */
  images?: ImagePins
}

export type SiteSettings = {
  name: string
  version: string
  images?: ImagePins
  /**
   * HQ's address, for a site a Fleet Console added (spec §6, step 5), which presents its own credential there. Absent
   * for HQ's default site, which reaches HQ over the private network on HQ's machine by the pairing secret.
   */
  hqUrl?: string
}

/** How a site reaches HQ and proves itself: the address it dials and the credential it presents. */
export type SiteConnection = { hqUrl: string; credential: string; onHqLinkNetwork: boolean }

const SITE_PORT = SERVICE_PORTS.site.server
export const HQ_WEB_PORT = SERVICE_PORTS.hq.web
/** Inside hq-server, where hq's control socket is (hq reads `HQ_CONTROL_SOCKET`). */
export const HQ_CONTROL_SOCKET = '/tmp/hq-control/control.sock'
/** Inside the site, where the figures volume is mounted: the same place as in the host service's container. */
export const SITE_FIGURES_MOUNT = '/run/host-figures'

export { imageRef }

/** The image a service runs: the one pinned when its signature was checked, else its name for the version. */
const image = (settings: { version: string; images?: ImagePins }, part: PublishedPart) =>
  settings.images?.[part] ?? imageRef(part, settings.version)

/**
 * The version a service runs as, which its image does not carry: the one it was installed or upgraded to. None for a
 * development build, which then says `dev` as it does when run by hand.
 */
export const versionEnv = (name: string, version: string): Record<string, string> => (isPublishedVersion(version) ? { [name]: version } : {})

export const siteDataPath = (paths: MachinePaths) => `${paths.state.replace(/\/+$/, '')}/site/data`

/** The address hq's default site dials: hq-web by its container name, over the private network they share. */
export const defaultSiteHqUrl = (names: InstallNames) => `http://${names.container('hq-web')}:${HQ_WEB_PORT}`

function database(names: InstallNames, role: string, db: string, password: string, volume: string, installation: Installation) {
  return {
    image: POSTGRES_IMAGE,
    pull_policy: 'never',
    container_name: names.container(`${role}-db`),
    environment: { POSTGRES_DB: db, POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: password },
    volumes: [`${volume}:/var/lib/postgresql/data`],
    networks: ['internal'],
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval: '5s', timeout: '5s', retries: 10 },
    restart: 'unless-stopped',
    // No version: its image is the pinned Postgres, the same in every release, and a changed label would make compose
    // recreate the database at each upgrade.
    labels: labels(names, role, installation),
  }
}

/**
 * The version a container runs as, for `docker inspect`; none for a development build. A label is no part of an image,
 * so it moves no content key.
 */
export const versionLabel = (names: Pick<InstallNames, 'label'>, version: string): Record<string, string> =>
  (isPublishedVersion(version) ? { [names.label('version')]: version } : {})

/** Its role, and the installation's published ports and agent range, which another installation's check reads. */
export function labels(names: InstallNames, role: string, installation: Installation, version?: string): Record<string, string> {
  return { [names.label('role')]: role, [names.label('managed-by')]: 'host', ...installationLabels(names, installation), ...(version ? versionLabel(names, version) : {}) }
}

/** HQ's published port, which only `installation.json` holds. */
export function hqPortOf(installation: Installation): number {
  if (installation.ports.hq === null) throw new Error("HQ's published port is not recorded in installation.json.")
  return installation.ports.hq
}

/**
 * `machineName`: this machine's, which HQ names its own site after. A label only. `cloud`: on a machine Agenthix Cloud
 * runs, HQ is told so, and talks to the same Cloud as this host service. `subnets`: each network's, from
 * `chooseSubnets` (compose/subnets.ts), given to every network a project makes rather than one an external.
 * `installation`: what it publishes hq-web on, and the labels every container carries.
 */
export function hqProject(
  names: InstallNames, hq: HqSettings, secrets: InstallSecrets, machineName: string, subnets: InstallSubnets,
  installation: Installation, cloud: CloudSettings | null = cloudSettings(),
) {
  const dbUrl = `postgresql://postgres:${secrets.hqDbPassword}@hq-db:${CONTAINER_DATABASE_PORT}/${names.hqDatabase}`
  return {
    name: names.hqProject,
    services: {
      'hq-db': database(names, 'hq', names.hqDatabase, secrets.hqDbPassword, 'db_data', installation),
      'hq-server': {
        image: image(hq, 'hq-server'),
        pull_policy: 'never',
        container_name: names.container('hq-server'),
        environment: {
          PORT: String(SERVICE_PORTS.hq.server),
          DATABASE_URL: dbUrl,
          WASP_SERVER_URL: hq.address,
          WASP_WEB_CLIENT_URL: hq.address,
          HQ_STORAGE_ROOT: '/hq-storage',
          HQ_TRUSTED_PROXIES: String(hq.trustedProxies),
          JWT_SECRET: secrets.jwtSecret,
          SECRETS_MASTER_KEY: secrets.hqMasterKey,
          HQ_PAIRING_SECRET: secrets.pairingSecret,
          HQ_CONSOLE_PAIRING_SECRET: secrets.consolePairingSecret,
          HQ_RELAY_SECRET: secrets.relaySecret,
          HQ_MACHINE_NAME: machineName,
          HQ_CONTROL_SOCKET,
          FILES_ORIGIN: hq.filesOrigin ?? '',
          ...(cloud ? { HQ_RUN_BY_CLOUD: 'true', [CLOUD_URL_SETTING]: cloud.url } : {}),
          ...versionEnv('APP_VERSION', hq.version),
        },
        volumes: ['storage:/hq-storage'],
        networks: ['internal'],
        depends_on: { 'hq-db': { condition: 'service_healthy' } },
        restart: 'unless-stopped',
        labels: labels(names, 'hq', installation, hq.version),
      },
      // hq's relay (adr-0153) carries the bytes of every file a browser opens: a site's, and hq's own uploads, which it
      // reads from hq's storage volume mounted read-only. It dials hq-server on the private network, is reached by
      // hq-web alone, and publishes nothing: hq-web sends it the tickets (on the files address, or under the bare
      // prefix on HQ's own) and the line sites dial.
      relay: {
        image: image(hq, 'relay'),
        pull_policy: 'never',
        container_name: names.container('relay'),
        environment: {
          RELAY_HQ_ADDRESS: `http://hq-server:${SERVICE_PORTS.hq.server}`,
          HQ_RELAY_SECRET: secrets.relaySecret,
          HQ_URL: hq.address,
          FILES_ORIGIN: hq.filesOrigin ?? '',
          RELAY_PORT: String(SERVICE_PORTS.relay.server),
          HQ_UPLOADS_ROOT: '/hq-storage',
        },
        volumes: ['storage:/hq-storage:ro'],
        networks: ['internal'],
        depends_on: ['hq-server'],
        healthcheck: {
          test: ['CMD', 'node', '-e', `fetch('http://127.0.0.1:${SERVICE_PORTS.relay.server}/health').then(r => process.exit(r.status === 200 ? 0 : 1), () => process.exit(1))`],
          interval: '10s', timeout: '5s', retries: 5, start_period: '10s',
        },
        restart: 'unless-stopped',
        labels: labels(names, 'hq', installation, hq.version),
      },
      'hq-web': {
        image: image(hq, 'hq-web'),
        pull_policy: 'never',
        container_name: names.container('hq-web'),
        // hq-web's browser app takes HQ's address when it starts (adr-0111).
        environment: {
          HQ_URL: hq.address, HQ_TRUSTED_PROXIES: String(hq.trustedProxies), PREVIEW_DOMAIN: '', FILES_ORIGIN: hq.filesOrigin ?? '',
        },
        ports: [`${hq.bind}:${hqPortOf(installation)}:${HQ_WEB_PORT}`],
        networks: ['internal', 'edge', 'link'],
        depends_on: ['hq-server'],
        restart: 'unless-stopped',
        labels: labels(names, 'hq', installation, hq.version),
      },
    },
    networks: {
      internal: { name: names.hqNetwork, ...ipam(subnets, names.hqNetwork) },
      edge: { name: names.edgeNetwork, ...ipam(subnets, names.edgeNetwork) },
      link: { name: names.hqLinkNetwork, ...ipam(subnets, names.hqLinkNetwork) },
    },
    volumes: { db_data: { name: names.hqDbVolume }, storage: { name: names.hqStorageVolume } },
  }
}

/** hq's default site, beside hq on the same machine, connected by the pairing secret (adr-0070). */
export function defaultSiteProject(
  names: InstallNames, site: SiteSettings, secrets: InstallSecrets, paths: MachinePaths, subnets: InstallSubnets, installation: Installation,
) {
  const hq = { hqUrl: defaultSiteHqUrl(names), credential: secrets.pairingSecret, onHqLinkNetwork: true }
  return siteProject(names, site, secrets, paths, hq, subnets, installation)
}

/**
 * A site, with how it reaches HQ. A site a Fleet Console added presents the credential this machine made for it the
 * way the default site presents the pairing secret, and joins no network of HQ's.
 */
export function siteProject(
  names: InstallNames, site: SiteSettings, secrets: InstallSecrets, paths: MachinePaths, hq: SiteConnection, subnets: InstallSubnets,
  installation: Installation,
) {
  // Recorded at the site's first install (`agentSlice.ts`): never a default, which another installation's agents may share.
  if (!installation.agentRange) throw new Error("No agent address range is recorded for this installation, so its site's compose file cannot be written.")
  const root = siteDataPath(paths)
  const internal = { name: names.siteNetwork, ...ipam(subnets, names.siteNetwork) }
  return {
    name: names.siteProject,
    services: {
      'site-db': database(names, 'site', names.siteDatabase, secrets.siteDbPassword, 'db_data', installation),
      site: {
        image: image(site, 'site-server'),
        pull_policy: 'never',
        container_name: names.siteContainer,
        init: true,
        environment: {
          PORT: String(SITE_PORT),
          DATABASE_URL: `postgresql://postgres:${secrets.siteDbPassword}@site-db:${CONTAINER_DATABASE_PORT}/${names.siteDatabase}`,
          SITE_ROOT: root,
          SITE_CONTAINER_NAME: names.siteContainer,
          AGENT_CONTAINER_ISOLATION: 'true',
          // The site names its agents, their labels and their group from it, as this service names everything.
          HOST_NAMESPACE: names.namespace,
          AGENT_NETWORK_RANGE: installation.agentRange,
          AGENT_IMAGE: image(site, 'agent'),
          EXECUTOR_IMAGE: image(site, 'executor'),
          HQ_URL: hq.hqUrl,
          HQ_PAIRING_SECRET: hq.credential,
          SECRETS_MASTER_KEY: secrets.siteMasterKey,
          HOST_FIGURES_SOCKET: `${SITE_FIGURES_MOUNT}/figures.sock`,
          ...versionEnv('APP_VERSION', site.version),
        },
        volumes: [
          // The data folder at the same path inside and out: the Docker the site drives resolves agent mounts on the machine.
          `${root}:${root}`,
          '/var/run/docker.sock:/var/run/docker.sock',
          `figures:${SITE_FIGURES_MOUNT}:ro`,
        ],
        extra_hosts: ['host.docker.internal:host-gateway'],
        networks: hq.onHqLinkNetwork ? ['internal', 'link'] : ['internal'],
        depends_on: { 'site-db': { condition: 'service_healthy' } },
        restart: 'unless-stopped',
        labels: labels(names, 'site', installation, site.version),
      },
    },
    networks: hq.onHqLinkNetwork ? { internal, link: { name: names.hqLinkNetwork, external: true } } : { internal },
    // The host service's own volume: compose neither creates nor removes it.
    volumes: { db_data: { name: names.siteDbVolume }, figures: { name: names.hostFiguresVolume, external: true } },
  }
}

function escapeDollars(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\$/g, '$$$$')
  if (Array.isArray(value)) return value.map(escapeDollars)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeDollars(v)]))
  }
  return value
}

export function composeJson(project: object): string {
  return `${JSON.stringify(escapeDollars(project), null, 2)}\n`
}
