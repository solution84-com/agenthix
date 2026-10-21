/**
 * The Fleet Console's compose project (host-management spec §7), on the machine that is its home: HQ's by default
 * (`install`), or another one (`console install`). Like hq-web, it runs on a Docker network and Docker publishes its
 * port to the machine's 127.0.0.1 only, so a browser on the machine — on Docker Desktop, the computer, not only the
 * virtual machine — opens it at 127.0.0.1:4300, and nothing off the machine can. The network is its own, which
 * nothing else joins, and in it the Fleet Console accepts a connection only from that network's gateway, through
 * which Docker forwards the published port (console/src/http/guards.ts).
 *
 * On HQ's machine it also joins HQ's link network, to dial hq-web by its container name as HQ's default site does;
 * it never answers on that network. Elsewhere it dials HQ's own address. It holds its keys in a volume of its own,
 * and has no Docker socket.
 */
import type { InstallNames } from '../state/namespace'
import type { ImagePins } from '../images/images'
import { imageRef } from '../images/published'
import { defaultSiteHqUrl } from './projects'
import { ipam, type InstallSubnets } from './subnets'

export const CONSOLE_PORT = 4300
export const CONSOLE_ADDRESS = `http://127.0.0.1:${CONSOLE_PORT}`
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
 * network's, from `chooseSubnets` (compose/subnets.ts); HQ's link network is HQ's project's.
 */
export function consoleProject(
  names: InstallNames, m: ConsoleSettings, machineName: string, admission: ConsoleAdmission, subnets: InstallSubnets,
  remotePort: number | null = null,
) {
  const environment: Record<string, string> = {
    CONSOLE_STATE_DIR: CONSOLE_STATE_MOUNT,
    CONSOLE_HQ_ADDRESS: m.onHqMachine ? defaultSiteHqUrl(names) : m.hqAddress,
    CONSOLE_MACHINE_NAME: machineName,
    // It listens on its own network's address, and reads that and the gateway it accepts inside the container.
    CONSOLE_LISTEN_HOST: 'container',
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
        ports: [`127.0.0.1:${CONSOLE_PORT}:${CONSOLE_PORT}`, ...(remotePort === null ? [] : [`${remotePort}:${remotePort}`])],
        networks: m.onHqMachine ? ['console', 'link'] : ['console'],
        // A packet is taken only on the network its source is reached through, so none claiming to come from its
        // network's gateway is taken from HQ's link network.
        sysctls: { 'net.ipv4.conf.all.rp_filter': '1', 'net.ipv4.conf.default.rp_filter': '1' },
        volumes: [`state:${CONSOLE_STATE_MOUNT}`],
        restart: 'unless-stopped',
        labels: { [names.label('role')]: 'console', [names.label('managed-by')]: 'host' },
      },
    },
    networks: m.onHqMachine
      ? { console: own, link: { name: names.hqLinkNetwork, external: true } }
      : { console: own },
    volumes: { state: { name: names.consoleStateVolume } },
  }
}
