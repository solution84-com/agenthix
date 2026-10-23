/**
 * The Fleet Console's compose project (host-management spec §7), on the machine that is its home: HQ's by default
 * (`install`), or another one (`console install`). Like hq-web, it runs on a Docker network and Docker publishes its
 * port to the machine's 127.0.0.1 only, so a browser on the machine — on Docker Desktop, the computer, not only the
 * virtual machine — opens it at 127.0.0.1 on the installation's console port, and nothing off the machine can. The network is its own, which
 * nothing else joins, and in it the Fleet Console accepts a connection only from that network's gateway, through
 * which Docker forwards the published port (console/src/http/guards.ts).
 *
 * On HQ's machine it also joins HQ's link network, to dial hq-web by its container name as HQ's default site does;
 * it never answers on that network. Elsewhere it dials HQ's own address. It holds its keys in a volume of its own,
 * and has no Docker socket.
 */
import { PUBLISHED_DEFAULTS, SERVICE_PORTS } from '@agenthix/core'
import type { InstallNames } from '../state/namespace'
import { installationLabels, type Installation } from '../state/installation'
import type { ImagePins } from '../images/images'
import { imageRef } from '../images/published'
import { defaultSiteHqUrl } from './projects'
import { ipam, type InstallSubnets } from './subnets'

/** Where it listens inside its container; Docker publishes the installation's console port onto it. */
export const CONSOLE_PORT = SERVICE_PORTS.console.server
/** Where a browser on its machine opens it: the installation's console port, on 127.0.0.1 only. */
export const consoleAddress = (published: number) => `http://127.0.0.1:${published}`
/** The address with the default port, for words written before an installation chose one. */
export const DEFAULT_CONSOLE_ADDRESS = consoleAddress(PUBLISHED_DEFAULTS.console)

/** The Fleet Console's published port, which only `installation.json` holds. */
export function consolePortOf(installation: Installation): number {
  if (installation.ports.console === null) throw new Error("The Fleet Console's published port is not recorded in installation.json.")
  return installation.ports.console
}
/** Where its state volume is mounted inside its container. */
export const CONSOLE_STATE_MOUNT = '/state'

export type ConsoleSettings = {
  version: string
  images?: ImagePins
  /**
   * HQ's own address elsewhere, which it dials. On HQ's machine, HQ's local listener, which this machine's host
   * service dials; the Fleet Console itself dials hq-web over HQ's link network there.
   */
  hqAddress: string
  /** On HQ's machine, it is admitted by the pairing secret; elsewhere, by the one-time code it redeemed. */
  onHqMachine: boolean
  installedAt: string
}

/** What only its environment carries: each is secret, and the compose file holding it is readable by its owner only. */
export type ConsoleAdmission = {
  pairingSecret?: string
  /** The one-time code from `hq console-code`, which it redeems once for a lasting credential. */
  hqCode?: string
}

/**
 * `remotePort`: on a machine Agenthix Cloud runs, while Cloud has remote access on (pre-release spec B9,
 * remoteAccess/), the one port published on every address, where the Fleet Console ends TLS itself and answers only
 * the addresses Cloud allows. Null everywhere else, and always on an organisation's own machine. `subnets`: its own
 * network's, from `chooseSubnets` (compose/subnets.ts); HQ's link network is HQ's project's. `installation`: the port
 * it is published on, and the labels it carries.
 */
export function consoleProject(
  names: InstallNames, m: ConsoleSettings, machineName: string, admission: ConsoleAdmission, subnets: InstallSubnets,
  installation: Installation, remotePort: number | null = null,
) {
  const published = consolePortOf(installation)
  const environment: Record<string, string> = {
    CONSOLE_STATE_DIR: CONSOLE_STATE_MOUNT,
    CONSOLE_HQ_ADDRESS: m.onHqMachine ? defaultSiteHqUrl(names) : m.hqAddress,
    CONSOLE_MACHINE_NAME: machineName,
    // It listens on its own network's address, and reads that and the gateway it accepts inside the container.
    CONSOLE_LISTEN_HOST: 'container',
    CONSOLE_PORT: String(CONSOLE_PORT),
    // Where a browser opens it, for the words it says; it never listens there.
    CONSOLE_PUBLISHED_PORT: String(published),
  }
  if (admission.pairingSecret) environment.HQ_CONSOLE_PAIRING_SECRET = admission.pairingSecret
  if (admission.hqCode) environment.CONSOLE_HQ_CODE = admission.hqCode
  const own = { name: names.consoleNetwork, ...ipam(subnets, names.consoleNetwork) }
  return {
    name: names.consoleProject,
    services: {
      console: {
        image: m.images?.console ?? imageRef('console', m.version),
        pull_policy: 'never',
        container_name: names.consoleContainer,
        environment,
        ports: [`127.0.0.1:${published}:${CONSOLE_PORT}`, ...(remotePort === null ? [] : [`${remotePort}:${remotePort}`])],
        networks: m.onHqMachine ? ['console', 'link'] : ['console'],
        // A packet is taken only on the network its source is reached through, so none claiming to come from its
        // network's gateway is taken from HQ's link network.
        sysctls: { 'net.ipv4.conf.all.rp_filter': '1', 'net.ipv4.conf.default.rp_filter': '1' },
        volumes: [`state:${CONSOLE_STATE_MOUNT}`],
        restart: 'unless-stopped',
        labels: { [names.label('role')]: 'console', [names.label('managed-by')]: 'host', ...installationLabels(names, installation) },
      },
    },
    networks: m.onHqMachine
      ? { console: own, link: { name: names.hqLinkNetwork, external: true } }
      : { console: own },
    volumes: { state: { name: names.consoleStateVolume } },
  }
}
