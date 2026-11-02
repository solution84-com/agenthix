/**
 * Services: the databases and other servers a workspace's apps need, run beside them in the live preview (live preview spec
 * section 4, *The app*). A workspace declares them in `SERVICES_FILE`, a small subset of the Compose format.
 * The file is parsed where no Docker socket is, and `readServicesFile` (servicesFile.ts) turns what was parsed into
 * `ServiceDeclaration`s or refuses it with every reason. The file is never handed to `docker compose`, and nothing in
 * it is filled in from variables: the site builds each container from its own fixed template, and the declaration
 * only fills that template's blanks.
 *
 * A new or changed service waits for a person's yes in HQ before it first starts: the `service.start` request names the
 * service and `serviceDeclarationHash` of its declaration, so the yes covers exactly what the person read.
 */
import { sha256, toHex } from '../host/crypto/webCrypto.js'
import { canonicalLines } from './canonical.js'

export const SERVICES_FILE = '.agents/services.yaml'
/** Larger than any real services file; a larger one is refused before it is parsed. */
export const SERVICES_FILE_MAX_BYTES = 64 * 1024

/** The fields a service may have. Everything else is refused, with the reason. */
export const SERVICE_FIELDS = ['image', 'command', 'environment', 'expose', 'healthcheck', 'depends_on', 'volumes'] as const

/**
 * Fields that would widen the sandbox, each with why, so the refusal says it. Any other field is refused as not
 * accepted.
 */
export const SERVICE_WIDENING_FIELDS: Record<string, string> = {
  privileged: 'it would give the container the whole machine',
  cap_add: 'it would give the container capabilities',
  devices: 'it would give the container the machine\'s devices',
  network_mode: 'it would put the container on another network than the live preview\'s',
  networks: 'services are on the live preview\'s services network only',
  pid: 'it would let the container see other processes',
  ipc: 'it would share memory with other processes',
  userns_mode: 'it would change who the container runs as on the machine',
  volumes_from: 'it would mount another container\'s files',
  secrets: 'no secret reaches a person\'s machine through a service',
  configs: 'it would mount files from outside the live preview',
  env_file: 'it would read a file from outside the declaration',
  build: 'services run public images; nothing is built from the workspace',
  ports: 'nothing is published on the machine; apps reach a service by its name',
  logging: 'logging is fixed by the site',
  restart: 'services start and stop with the live preview',
  user: 'a service always runs as an ordinary user',
  security_opt: 'it would change the container\'s security settings',
  sysctls: 'it would change the kernel\'s settings',
  extra_hosts: 'it would change how names resolve in the live preview',
  dns: 'it would change how names resolve in the live preview',
  cgroup_parent: 'it would move the container out of the live preview\'s ceiling',
  runtime: 'the container runtime is fixed by the site',
  tmpfs: 'writable areas are fixed by the site',
}

export const SERVICE_LIMITS = {
  services: 10,
  environment: 200,
  valueChars: 8192,
  commandArgs: 256,
  argChars: 4096,
  expose: 32,
  imageChars: 255,
} as const

export const DEPENDS_CONDITIONS = ['service_started', 'service_healthy', 'service_completed_successfully'] as const
export type DependsCondition = (typeof DEPENDS_CONDITIONS)[number]

export type ServiceHealthcheck = {
  /** Docker's form: `['CMD', program, ...args]` or `['CMD-SHELL', command]`. */
  test: string[]
  intervalMs: number
  timeoutMs: number
  retries: number
  startPeriodMs: number
}

/** One service, as the site's template takes it: every list in a fixed order, so the same file gives the same bytes. */
export type ServiceDeclaration = {
  name: string
  image: string
  /** Replaces the image's command; null keeps it. */
  command: string[] | null
  /** Sorted by name. */
  environment: [string, string][]
  /** Sorted, each once. */
  expose: number[]
  /** Null keeps the image's own, or none. */
  healthcheck: ServiceHealthcheck | null
  /** Sorted by service. */
  dependsOn: [string, DependsCondition][]
  /** The one named volume it mounts, if any. The site names the volume itself; this name is the file's. */
  volume: { name: string; target: string; readOnly: boolean } | null
}

export type ServicesDeclared = { services: ServiceDeclaration[]; volumes: string[] }

/**
 * Why the file, or a part of it, was refused:
 * - `notAFile`: not YAML, too large, or not a mapping with `services`;
 * - `notAllowed`: a field this subset does not accept; `widens`: one that would widen the sandbox (the message says how);
 * - `badValue`: a value of the wrong form; `badName`: a service or volume name that is not one;
 * - `badImage`: not an image named by DNS name (no address, no `localhost`);
 * - `interpolation`: a value asking to be filled in from a variable, which nothing here does;
 * - `hostPath`: a volume from the machine's files; `unknownVolume`, `volumeOptions`, `volumeShared`, `oneVolume`:
 *   volumes are named, declared without options, one per service, each used by one service;
 * - `unknownService`, `dependsCycle`: `depends_on` names no service, or goes round;
 * - `tooMany`: past `SERVICE_LIMITS`.
 */
export const SERVICE_PROBLEM_CODES = [
  'notAFile', 'notAllowed', 'widens', 'badValue', 'badName', 'badImage', 'interpolation', 'hostPath', 'unknownVolume',
  'volumeOptions', 'volumeShared', 'oneVolume', 'unknownService', 'dependsCycle', 'tooMany',
] as const
export type ServiceProblemCode = (typeof SERVICE_PROBLEM_CODES)[number]
/** `at`: where, as a dotted path (`services.postgres.privileged`). `message`: what is wrong and what to do. */
export type ServiceProblem = { at: string; code: ServiceProblemCode; message: string }

export type ServicesFileRead = ({ ok: true } & ServicesDeclared) | { ok: false; problems: ServiceProblem[] }

/** The bytes a declaration is hashed from: one line per field (canonical.ts), each list written as JSON. */
export function encodeServiceDeclaration(d: ServiceDeclaration): Uint8Array {
  return canonicalLines([
    ['name', d.name],
    ['image', d.image],
    ['command', d.command === null ? null : JSON.stringify(d.command)],
    ['environment', d.environment],
    ['expose', JSON.stringify(d.expose)],
    ['healthcheck', d.healthcheck === null ? null : JSON.stringify([
      d.healthcheck.test, d.healthcheck.intervalMs, d.healthcheck.timeoutMs, d.healthcheck.retries, d.healthcheck.startPeriodMs,
    ])],
    ['dependsOn', d.dependsOn],
    ['volume', d.volume === null ? null : JSON.stringify([d.volume.name, d.volume.target, d.volume.readOnly])],
  ])
}

/** What `service.start` names: the SHA-256 of the declaration's encoding, lower-case hex. A change gives a new one. */
export async function serviceDeclarationHash(d: ServiceDeclaration): Promise<string> {
  return toHex(await sha256(encodeServiceDeclaration(d)))
}

/**
 * A service in a live preview, as the site reports it:
 * - `waiting`: new or changed since a person last said yes to it; it starts once one does;
 * - `starting`: its container is made, checked against the template and started; waiting until healthy;
 * - `running`, `stopped`, `failed` (`detail` says why, in a sentence the person reads).
 */
export const SERVICE_STATES = ['waiting', 'starting', 'running', 'stopped', 'failed'] as const
export type ServiceState = (typeof SERVICE_STATES)[number]

export type ServiceStatus = {
  name: string
  state: ServiceState
  /** `serviceDeclarationHash` of the declaration it runs, or waits to run. */
  declarationHash: string
  declaration: ServiceDeclaration
  detail: string | null
}
