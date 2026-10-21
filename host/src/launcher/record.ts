/**
 * The settings the host service's own container runs with (ADR-0118), recorded in its state folder so the same
 * container can be started again from another image — by the launcher, or by the machine admin with the commands
 * the CLI prints. They are read from Docker's `inspect` of the container itself: no request carries any of them,
 * and what is read back is checked field by field before it is kept or used.
 */
import type { StateFolder } from '../state/folder'
import { COMPOSE_PROJECT_LABEL, type ContainerOps, type ContainerSpec, type InspectedContainer, type Mount } from '../docker/containers'
import { STATE_MOUNT } from '../service/context'
import type { InstallNames } from '../state/namespace'

export const DOCKER_SOCKET = '/var/run/docker.sock'
const FILE = ['launcher', 'container.json']

export type HostContainerRecord = {
  /** The container recorded, by its id. */
  containerId: string
  /** The image it runs, by its id. */
  image: string
  mounts: Mount[]
  network: string
  capAdd: string[]
  /** What `docker run -e` set: the container's environment less its image's own. */
  env: string[]
  restart: string
  recordedAt: string
}

const ID = /^(sha256:)?[0-9a-f]{64}$/
const PATH = /^\/[^\u0000-\u001f]*$/
const VOLUME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const NETWORK = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const CAPABILITY = /^[A-Z][A-Z_]{1,40}$/
const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}=[^\u0000]{0,4096}$/
const RESTART = /^(no|always|unless-stopped|on-failure(:\d{1,3})?)$/

function validMount(m: unknown): m is Mount {
  const x = m as Partial<Record<string, unknown>>
  if (!x || typeof x.destination !== 'string' || !PATH.test(x.destination) || typeof x.readOnly !== 'boolean') return false
  if (x.type === 'bind') return typeof x.source === 'string' && PATH.test(x.source)
  return x.type === 'volume' && typeof x.name === 'string' && VOLUME.test(x.name)
}

const sourceAt = (mounts: Mount[], destination: string) => mounts.find(m => m.destination === destination)

/** Why these settings cannot start the host service again; null when they can. */
export function recordProblem(r: Omit<HostContainerRecord, 'recordedAt'>): string | null {
  if (!ID.test(r.containerId) || !ID.test(r.image)) return 'Docker did not name its container or image by id'
  if (!r.mounts.every(validMount)) return 'one of its mounts is not a folder or a volume'
  const socket = sourceAt(r.mounts, DOCKER_SOCKET)
  if (!socket || socket.type !== 'bind') return `it has no Docker socket mounted at ${DOCKER_SOCKET}`
  if (!sourceAt(r.mounts, STATE_MOUNT)) return `it has no state folder mounted at ${STATE_MOUNT}`
  if (!NETWORK.test(r.network)) return 'its network is not one Docker names'
  if (!r.capAdd.every(c => CAPABILITY.test(c))) return 'one of its capabilities is not one Docker names'
  if (!r.env.every(e => ENV.test(e))) return 'one of its environment settings cannot be passed on'
  if (!RESTART.test(r.restart)) return 'its restart policy is not one Docker names'
  return null
}

/** The settings of `container` worth starting it again with; the image's own environment is left to the image. */
export function recordFrom(container: InspectedContainer, imageEnv: string[], now: Date): HostContainerRecord | { problem: string } {
  if (!container.mounts) return { problem: 'one of its mounts is not a folder or a volume' }
  const own = new Set(imageEnv)
  const record: HostContainerRecord = {
    containerId: container.id.replace(/^sha256:/, ''),
    image: container.image,
    mounts: container.mounts,
    network: container.network,
    capAdd: container.capAdd,
    env: container.env.filter(e => !own.has(e)),
    restart: container.restart,
    recordedAt: now.toISOString(),
  }
  const problem = recordProblem(record)
  return problem ? { problem } : record
}

/** Reads the host service's own container, `name`, and records its settings; the problem in words when it cannot. */
export async function recordHostContainer(containers: ContainerOps, state: StateFolder, now: Date, name: string): Promise<HostContainerRecord | { problem: string }> {
  const self = await containers.inspect(name)
  if (!self) return { problem: `Docker has no container named ${name}` }
  const image = await containers.image(self.image)
  if (!image) return { problem: `Docker cannot read the image ${self.image}` }
  const record = recordFrom(self, image.env, now)
  if ('problem' in record) return record
  state.writeJson(FILE, record)
  return record
}

/** The recorded settings, checked again as they are read; null when there are none, or they do not pass. */
export function readRecord(state: StateFolder): HostContainerRecord | null {
  const raw = state.readJson(...FILE) as Partial<HostContainerRecord> | null
  if (!raw || typeof raw !== 'object') return null
  const { containerId, image, mounts, network, capAdd, env, restart, recordedAt } = raw
  if (typeof containerId !== 'string' || typeof image !== 'string' || !Array.isArray(mounts) || typeof network !== 'string'
    || !Array.isArray(capAdd) || !Array.isArray(env) || typeof restart !== 'string' || typeof recordedAt !== 'string') return null
  if (!capAdd.every(c => typeof c === 'string') || !env.every(e => typeof e === 'string')) return null
  const record: HostContainerRecord = {
    containerId, image, network, restart, recordedAt,
    mounts: mounts.map(m => ({ ...m })),
    capAdd: [...capAdd],
    env: [...env],
  }
  return recordProblem(record) ? null : record
}

/** The host service's group, which each new version is started in too, whatever the one before it carried. */
export const hostLabels = (names: Pick<InstallNames, 'hostProject'>) => ({ [COMPOSE_PROJECT_LABEL]: names.hostProject })

/** The host service's container as recorded, from `image`, under its own name and in its own group. */
export function hostSpec(record: HostContainerRecord, image: string, names: Pick<InstallNames, 'hostContainer' | 'hostProject'>): ContainerSpec {
  return {
    name: names.hostContainer, image, mounts: record.mounts, network: record.network, capAdd: record.capAdd, env: record.env,
    restart: record.restart, labels: hostLabels(names),
  }
}

const shellQuoted = (p: string) => (/^[A-Za-z0-9_./:=@,+-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`)

/** A `docker run` argument list as a person types it in a shell. */
export const shellCommand = (args: string[]) => ['docker', ...args].map(shellQuoted).join(' ')
