/**
 * The compose projects the host service writes into its state folder and runs (host-management spec §6): hq
 * (hq-db, hq-server, hq-web) and its default site (site-db, site). Every stored name comes from the recorded
 * namespace; every image name from the branding module's `imageName`. Each image is the one install checked and
 * fetched (`images/images.ts`), fixed by its digest, and compose never fetches one itself (`pull_policy: never`).
 *
 * Written as JSON, which is YAML, so no value needs YAML quoting. Compose still interpolates `$` in every string,
 * so each is escaped as `$$` (`composeJson`).
 */
import { CLOUD_URL_SETTING } from '@agenthix/core'
import type { InstallNames } from '../state/namespace'
import type { ImagePins } from '../images/images'
import { imageRef, POSTGRES_IMAGE, type PublishedPart } from '../images/published'
import type { InstallSecrets } from '../state/secrets'
import { cloudSettings, type CloudSettings } from '../config'
import { ipam, type InstallSubnets } from './subnets'

/** Where the host service's state folder is on the machine, which bind mounts must name (the CLI runs inside). */
export type MachinePaths = { state: string }

export type HqSettings = {
  address: string
  /** Where hq-web listens on the machine. */
  bind: string
  port: number
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

const SITE_PORT = 4201
export const HQ_WEB_PORT = 4100
/** Inside hq-server, where hq's control socket is (hq reads `HQ_CONTROL_SOCKET`). */
export const HQ_CONTROL_SOCKET = '/tmp/hq-control/control.sock'
/** Inside the site, where the figures volume is mounted: the same place as in the host service's container. */
export const SITE_FIGURES_MOUNT = '/run/host-figures'
export const AGENT_NETWORK_RANGE = '10.213.0.0/16'

export { imageRef }

/** The image a service runs: the one pinned when its signature was checked, else its name for the version. */
const image = (settings: { version: string; images?: ImagePins }, part: PublishedPart) =>
  settings.images?.[part] ?? imageRef(part, settings.version)

export const siteDataPath = (paths: MachinePaths) => `${paths.state.replace(/\/+$/, '')}/site/data`

/** The address hq's default site dials: hq-web by its container name, over the private network they share. */
export const defaultSiteHqUrl = (names: InstallNames) => `http://${names.container('hq-web')}:${HQ_WEB_PORT}`

function database(names: InstallNames, role: string, db: string, password: string, volume: string) {
  return {
    image: POSTGRES_IMAGE,
    pull_policy: 'never',
    container_name: names.container(`${role}-db`),
    environment: { POSTGRES_DB: db, POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: password },
    volumes: [`${volume}:/var/lib/postgresql/data`],
    networks: ['internal'],
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval: '5s', timeout: '5s', retries: 10 },
    restart: 'unless-stopped',
    labels: labels(names, role),
  }
}

function labels(names: InstallNames, role: string): Record<string, string> {
  return { [names.label('role')]: role, [names.label('managed-by')]: 'host' }
}

/**
 * `machineName`: this machine's, which HQ names its own site after. A label only. `cloud`: on a machine Agenthix Cloud
 * runs, HQ is told so, and talks to the same Cloud as this host service. `subnets`: each network's, from
 * `chooseSubnets` (compose/subnets.ts), given to every network a project makes rather than one an external.
 */
export function hqProject(
  names: InstallNames, hq: HqSettings, secrets: InstallSecrets, machineName: string, subnets: InstallSubnets,
  cloud: CloudSettings | null = cloudSettings(),
) {
  const dbUrl = `postgresql://postgres:${secrets.hqDbPassword}@hq-db:5432/${names.hqDatabase}`
  return {
    name: names.hqProject,
    services: {
      'hq-db': database(names, 'hq', names.hqDatabase, secrets.hqDbPassword, 'db_data'),
      'hq-server': {
        image: image(hq, 'hq-server'),
        pull_policy: 'never',
        container_name: names.container('hq-server'),
        environment: {
          PORT: '4101',
          DATABASE_URL: dbUrl,
          WASP_SERVER_URL: hq.address,
          WASP_WEB_CLIENT_URL: hq.address,
          HQ_STORAGE_ROOT: '/hq-storage',
          HQ_TRUSTED_PROXIES: String(hq.trustedProxies),
          JWT_SECRET: secrets.jwtSecret,
          SECRETS_MASTER_KEY: secrets.hqMasterKey,
          HQ_PAIRING_SECRET: secrets.pairingSecret,
          HQ_CONSOLE_PAIRING_SECRET: secrets.consolePairingSecret,
          HQ_MACHINE_NAME: machineName,
          HQ_CONTROL_SOCKET,
          FILES_ORIGIN: hq.filesOrigin ?? '',
          ...(cloud ? { HQ_RUN_BY_CLOUD: 'true', [CLOUD_URL_SETTING]: cloud.url } : {}),
        },
        volumes: ['storage:/hq-storage'],
        networks: ['internal'],
        depends_on: { 'hq-db': { condition: 'service_healthy' } },
        restart: 'unless-stopped',
        labels: labels(names, 'hq'),
      },
      'hq-web': {
        image: image(hq, 'hq-web'),
        pull_policy: 'never',
        container_name: names.container('hq-web'),
        // hq-web's browser app takes HQ's address when it starts (adr-0111).
        environment: {
          HQ_URL: hq.address, HQ_TRUSTED_PROXIES: String(hq.trustedProxies), PREVIEW_DOMAIN: '', FILES_ORIGIN: hq.filesOrigin ?? '',
        },
        ports: [`${hq.bind}:${hq.port}:${HQ_WEB_PORT}`],
        networks: ['internal', 'edge', 'link'],
        depends_on: ['hq-server'],
        restart: 'unless-stopped',
        labels: labels(names, 'hq'),
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
export function defaultSiteProject(names: InstallNames, site: SiteSettings, secrets: InstallSecrets, paths: MachinePaths, subnets: InstallSubnets) {
  const hq = { hqUrl: defaultSiteHqUrl(names), credential: secrets.pairingSecret, onHqLinkNetwork: true }
  return siteProject(names, site, secrets, paths, hq, subnets)
}

/**
 * A site, with how it reaches HQ. A site a Fleet Console added presents the credential this machine made for it the
 * way the default site presents the pairing secret, and joins no network of HQ's.
 */
export function siteProject(
  names: InstallNames, site: SiteSettings, secrets: InstallSecrets, paths: MachinePaths, hq: SiteConnection, subnets: InstallSubnets,
) {
  const root = siteDataPath(paths)
  const internal = { name: names.siteNetwork, ...ipam(subnets, names.siteNetwork) }
  return {
    name: names.siteProject,
    services: {
      'site-db': database(names, 'site', names.siteDatabase, secrets.siteDbPassword, 'db_data'),
      site: {
        image: image(site, 'site-server'),
        pull_policy: 'never',
        container_name: names.siteContainer,
        init: true,
        environment: {
          PORT: String(SITE_PORT),
          DATABASE_URL: `postgresql://postgres:${secrets.siteDbPassword}@site-db:5432/${names.siteDatabase}`,
          SITE_ROOT: root,
          SITE_CONTAINER_NAME: names.siteContainer,
          AGENT_CONTAINER_ISOLATION: 'true',
          // The site names its agents, their labels and their group from it, as this service names everything.
          HOST_NAMESPACE: names.namespace,
          AGENT_NETWORK_RANGE,
          AGENT_IMAGE: image(site, 'agent'),
          HQ_URL: hq.hqUrl,
          HQ_PAIRING_SECRET: hq.credential,
          SECRETS_MASTER_KEY: secrets.siteMasterKey,
          HOST_FIGURES_SOCKET: `${SITE_FIGURES_MOUNT}/figures.sock`,
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
        labels: labels(names, 'site'),
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
