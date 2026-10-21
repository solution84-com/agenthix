/**
 * The Docker actions on the host service's own container and on its launcher (ADR-0118): reading a container's
 * settings back, and starting, stopping, renaming and removing one. Like `docker.ts`, each is an argument list built
 * here, never through a shell, from settings Docker itself reported — no request carries anything into them.
 */
import { DockerError, type DockerRunner, type RunResult } from './docker'

export type Mount =
  | { type: 'bind'; source: string; destination: string; readOnly: boolean }
  | { type: 'volume'; name: string; destination: string; readOnly: boolean }

/** A container as `docker run` starts it: only the settings the host service's own container is started with. */
export type ContainerSpec = {
  name: string
  image: string
  mounts: Mount[]
  network: string
  capAdd: string[]
  /** `KEY=value`, each set on the container beyond its image's own. */
  env: string[]
  /** `no`, `always`, `unless-stopped` or `on-failure[:n]`. */
  restart: string
  /** `com.docker.compose.project`, the group Docker Desktop shows it in, among others. */
  labels: Record<string, string>
  /** In place of the image's command; its entry point stays. */
  command?: string[]
}

/** The label Docker Desktop groups containers by, which compose sets on its own and `docker run` must set itself. */
export const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'

export type InspectedContainer = {
  id: string
  name: string
  /** The image's id, `sha256:…`. */
  image: string
  running: boolean
  env: string[]
  /** Null when a mount is of a kind the host service does not start a container with (tmpfs, a named pipe). */
  mounts: Mount[] | null
  network: string
  capAdd: string[]
  restart: string
}

export type ImageInfo = { id: string; env: string[]; version: string | null }

/** What the launcher and the host service ask of Docker about containers; tests stand in a fake. */
export interface ContainerOps {
  inspect(nameOrId: string): Promise<InspectedContainer | null>
  image(ref: string): Promise<ImageInfo | null>
  run(spec: ContainerSpec): Promise<void>
  stop(nameOrId: string): Promise<void>
  start(nameOrId: string): Promise<void>
  rename(nameOrId: string, to: string): Promise<void>
  remove(nameOrId: string): Promise<void>
  /** Clears a container's restart policy, so it stays stopped once it ends. */
  noRestart(nameOrId: string): Promise<void>
  exec(nameOrId: string, command: string[], timeoutMs: number): Promise<RunResult>
}

/** One field of `--mount`, quoted as Docker's CSV reader takes it when it holds a comma or a quote. */
const field = (key: string, value: string) => {
  const kv = `${key}=${value}`
  return /[",]/.test(kv) ? `"${kv.replace(/"/g, '""')}"` : kv
}

export function mountArg(m: Mount): string {
  const src = m.type === 'bind' ? field('src', m.source) : field('src', m.name)
  return [`type=${m.type}`, src, field('dst', m.destination), ...(m.readOnly ? ['readonly'] : [])].join(',')
}

export function runArgs(spec: ContainerSpec): string[] {
  return [
    'run', '-d', '--name', spec.name, '--restart', spec.restart,
    ...spec.mounts.flatMap(m => ['--mount', mountArg(m)]),
    '--network', spec.network,
    ...spec.capAdd.flatMap(c => ['--cap-add', c]),
    ...spec.env.flatMap(e => ['-e', e]),
    ...Object.entries(spec.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
    spec.image,
    ...(spec.command ?? []),
  ]
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

function mountOf(raw: unknown): Mount | null {
  const m = raw as { Type?: unknown; Source?: unknown; Name?: unknown; Destination?: unknown; RW?: unknown }
  if (typeof m.Destination !== 'string') return null
  const readOnly = m.RW === false
  if (m.Type === 'bind' && typeof m.Source === 'string') return { type: 'bind', source: m.Source, destination: m.Destination, readOnly }
  if (m.Type === 'volume' && typeof m.Name === 'string') return { type: 'volume', name: m.Name, destination: m.Destination, readOnly }
  return null
}

/** What `docker container inspect` says of a container, reduced to the settings it is started with. */
export function parseInspect(raw: unknown): InspectedContainer | null {
  const c = raw as {
    Id?: unknown; Name?: unknown; Image?: unknown; State?: { Running?: unknown }; Config?: { Env?: unknown }; Mounts?: unknown
    HostConfig?: { NetworkMode?: unknown; CapAdd?: unknown; RestartPolicy?: { Name?: unknown; MaximumRetryCount?: unknown } }
  }
  if (!c || typeof c.Id !== 'string' || typeof c.Name !== 'string' || typeof c.Image !== 'string') return null
  const mounts = Array.isArray(c.Mounts) ? c.Mounts.map(mountOf) : []
  const policy = c.HostConfig?.RestartPolicy
  const name = typeof policy?.Name === 'string' && policy.Name ? policy.Name : 'no'
  const tries = typeof policy?.MaximumRetryCount === 'number' ? policy.MaximumRetryCount : 0
  return {
    id: c.Id,
    name: c.Name.replace(/^\//, ''),
    image: c.Image,
    running: c.State?.Running === true,
    env: strings(c.Config?.Env),
    mounts: mounts.every((m): m is Mount => m !== null) ? mounts : null,
    network: typeof c.HostConfig?.NetworkMode === 'string' ? c.HostConfig.NetworkMode : 'default',
    capAdd: strings(c.HostConfig?.CapAdd),
    restart: name === 'on-failure' && tries > 0 ? `on-failure:${tries}` : name,
  }
}

const VERSION_LABEL = 'org.opencontainers.image.version'

export class Containers implements ContainerOps {
  constructor(private readonly docker: DockerRunner) {}

  private async ok(args: string[], timeoutMs = 60_000): Promise<string> {
    const r = await this.docker(args, { timeoutMs })
    if (r.code !== 0) throw new DockerError(args, r)
    return r.stdout
  }

  private async json(args: string[]): Promise<unknown | null> {
    const r = await this.docker(args, { timeoutMs: 30_000 })
    if (r.code !== 0) {
      if (/no such (container|image|object)/i.test(r.stderr)) return null
      throw new DockerError(args, r)
    }
    return JSON.parse(r.stdout)
  }

  async inspect(nameOrId: string): Promise<InspectedContainer | null> {
    const raw = await this.json(['container', 'inspect', '--format', '{{json .}}', nameOrId])
    return raw === null ? null : parseInspect(raw)
  }

  async image(ref: string): Promise<ImageInfo | null> {
    const raw = (await this.json(['image', 'inspect', '--format', '{{json .}}', ref])) as { Id?: unknown; Config?: { Env?: unknown; Labels?: Record<string, unknown> | null } } | null
    if (!raw || typeof raw.Id !== 'string') return null
    const version = raw.Config?.Labels?.[VERSION_LABEL]
    return { id: raw.Id, env: strings(raw.Config?.Env), version: typeof version === 'string' ? version : null }
  }

  async run(spec: ContainerSpec): Promise<void> {
    await this.ok(runArgs(spec), 5 * 60_000)
  }

  async stop(nameOrId: string): Promise<void> {
    await this.ok(['stop', '--time', '30', nameOrId], 2 * 60_000)
  }

  async start(nameOrId: string): Promise<void> {
    await this.ok(['start', nameOrId])
  }

  async rename(nameOrId: string, to: string): Promise<void> {
    await this.ok(['rename', nameOrId, to])
  }

  async remove(nameOrId: string): Promise<void> {
    await this.ok(['rm', '--force', nameOrId], 2 * 60_000)
  }

  async noRestart(nameOrId: string): Promise<void> {
    await this.ok(['update', '--restart', 'no', nameOrId])
  }

  exec(nameOrId: string, command: string[], timeoutMs: number): Promise<RunResult> {
    return this.docker(['exec', nameOrId, ...command], { timeoutMs })
  }
}
