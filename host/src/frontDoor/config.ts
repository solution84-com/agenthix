/**
 * The front door the host service can run on a machine (host-management spec §6): Caddy on ports 80 and 443,
 * holding the certificates for HQ's host and its uploaded files' host, and passing both to hq-web over the
 * machine's edge network. Its Caddyfile is written here and nowhere else, from host names checked first; it has
 * no admin API and no Docker socket.
 */
import { createHash } from 'node:crypto'
import type { HqSettings, MachinePaths } from '../compose/projects'
import { HQ_WEB_PORT } from '../compose/projects'
import type { InstallNames } from '../state/namespace'

/**
 * Caddy's official image, not ours to sign, so fixed by the digest of its multi-platform index as hq's database
 * is (images/published.ts). Moved forward deliberately, with a release.
 */
export const FRONT_DOOR_IMAGE = 'caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d'

/** What the state folder holds of the front door, beside its Caddyfile and compose project. */
export type FrontDoorSettings = {
  on: boolean; hosts: string[]; since: string
  /**
   * Set when the certificate and the files host were given (given.ts): the front door serves that certificate and never
   * asks a certificate authority, and `filesOrigin` (null for downloads only) is kept through a new address.
   */
  given?: { filesOrigin: string | null }
}

export const FRONT_DOOR_FILES = ['Caddyfile', 'compose.json', 'settings.json'] as const

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** Why `host` cannot have a certificate from the front door, in words a person reads; null when it can. */
export function hostNameProblem(host: string): string | null {
  if (host.length > 253) return 'it is longer than a host name may be'
  const labels = host.split('.')
  if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return 'it is not a host name, such as files.hq.example.com'
  if (/^\d+$/.test(labels[labels.length - 1])) return 'it is a network address, which no certificate can be had for'
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return 'only this machine or its network can reach it'
  return null
}

export const hostOf = (address: string) => new URL(address).hostname.toLowerCase()

/** The front door's project and container, both derived from the recorded namespace. */
export const frontDoorProject = (names: InstallNames) => `${names.namespace}-front-door`

/** Where a given certificate and its key are in the front door's container, and in the state folder beside its Caddyfile. */
export const GIVEN_IN_CONTAINER = { certificate: '/etc/caddy/tls/certificate.pem', privateKey: '/etc/caddy/tls/private-key.pem' } as const
export const GIVEN_FILES = { certificate: ['front-door', 'tls', 'certificate.pem'], privateKey: ['front-door', 'tls', 'private-key.pem'] } as const

/** `givenCertificate`: serve the certificate in the state folder, and never try a certificate authority. */
export function caddyfile(names: InstallNames, hosts: string[], givenCertificate = false): string {
  for (const host of hosts) {
    const problem = hostNameProblem(host)
    if (problem) throw new Error(`${host} cannot be served by the front door: ${problem}.`)
  }
  return [
    '# Written by the host service; changed only through its front-door command.',
    '{',
    '\tadmin off',
    ...(givenCertificate ? ['\tauto_https disable_certs'] : []),
    '}',
    '',
    // hq-web tells HQ's host and the files host apart by name, so the request's own Host is passed on unchanged.
    `${hosts.join(', ')} {`,
    ...(givenCertificate ? [`\ttls ${GIVEN_IN_CONTAINER.certificate} ${GIVEN_IN_CONTAINER.privateKey}`] : []),
    `\treverse_proxy ${names.container('hq-web')}:${HQ_WEB_PORT}`,
    '}',
    '',
  ].join('\n')
}

/** `givenCertificate`: the certificate's own text, whose change starts the front door again with the new one. */
export function frontDoorCompose(names: InstallNames, paths: MachinePaths, config: string, givenCertificate?: string) {
  const state = paths.state.replace(/\/+$/, '')
  return {
    name: frontDoorProject(names),
    services: {
      'front-door': {
        image: FRONT_DOOR_IMAGE,
        pull_policy: 'never',
        container_name: names.container('front-door'),
        ports: ['80:80', '443:443'],
        volumes: [
          `${state}/front-door/Caddyfile:/etc/caddy/Caddyfile:ro`,
          ...(givenCertificate ? [`${state}/front-door/tls:/etc/caddy/tls:ro`] : []),
          // Certificates. Losing them means asking the certificate authority again, which limits repeats.
          'data:/data',
          'config:/config',
        ],
        networks: ['edge'],
        restart: 'unless-stopped',
        labels: {
          [names.label('role')]: 'front-door',
          [names.label('managed-by')]: 'host',
          // A changed Caddyfile changes the project, so compose starts the front door again with it.
          [names.label('config')]: createHash('sha256').update(config).update(givenCertificate ?? '').digest('hex').slice(0, 16),
        },
      },
    },
    networks: { edge: { name: names.edgeNetwork, external: true } },
    volumes: { data: { name: names.frontDoorDataVolume }, config: { name: names.frontDoorConfigVolume } },
  }
}

/** HQ's host and its uploaded files' host, which the front door holds certificates for. */
export function frontDoorHosts(hq: Pick<HqSettings, 'address' | 'filesOrigin'>): string[] {
  const hosts = [hostOf(hq.address)]
  if (hq.filesOrigin) hosts.push(hostOf(hq.filesOrigin))
  return hosts
}
