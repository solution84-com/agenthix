/**
 * Docker's containers for tests, without Docker: each container by id with its name, image and settings, and a
 * running host service answering as the version the reference it was started from names, as a real one does.
 */
import type { RunResult } from '../../docker/docker'
import type { ContainerOps, ContainerSpec, ImageInfo, InspectedContainer } from '../../docker/containers'
import { hostVersionOf } from '../../images/published'

export type FakeContainer = InspectedContainer & { command: string[]; labels: Record<string, string> }

export const OLD_IMAGE = `sha256:${'a'.repeat(64)}`
export const NEW_IMAGE = `sha256:${'b'.repeat(64)}`
export const OLD_ID = 'c'.repeat(64)
/** What the old host service was started from: the install's `docker run`, by its version's tag. */
export const OLD_REF = 'ghcr.io/solution84-com/agenthix-host:0.2.0'

const IMAGE_ENV = ['PATH=/usr/local/bin:/usr/bin:/bin', 'NODE_VERSION=24.14.1', 'NODE_ENV=production']

export class FakeContainers implements ContainerOps {
  containers = new Map<string, FakeContainer>()
  images = new Map<string, ImageInfo>([
    [OLD_IMAGE, { id: OLD_IMAGE, env: IMAGE_ENV, repoDigests: [] }],
    [NEW_IMAGE, { id: NEW_IMAGE, env: IMAGE_ENV, repoDigests: [] }],
  ])
  /** Other names an image goes by, such as `<repository>@sha256:…`, to its id. */
  refs = new Map<string, string>()
  /** Images whose host service never answers. */
  silent = new Set<string>()
  /** Actions that fail, by name: `run`, `start`, `stop`, `rename`. */
  failing = new Set<string>()
  calls: string[] = []
  private next = 1

  constructor(ns = 'agenthix') {
    this.containers.set(OLD_ID, {
      id: OLD_ID, name: `${ns}-host`, image: OLD_IMAGE, reference: OLD_REF, running: true, command: [],
      labels: { 'com.docker.compose.project': `${ns}-host` },
      env: [...IMAGE_ENV, 'TZ=Europe/London'],
      mounts: [
        { type: 'bind', source: '/var/run/docker.sock', destination: '/var/run/docker.sock', readOnly: false },
        { type: 'bind', source: '/home/sam/.agenthix', destination: '/state', readOnly: false },
        { type: 'volume', name: 'agenthix-host-figures', destination: '/run/host-figures', readOnly: false },
      ],
      network: 'host', capAdd: ['NET_ADMIN'], restart: 'unless-stopped',
    })
  }

  private find(nameOrId: string): FakeContainer | null {
    return this.containers.get(nameOrId) ?? [...this.containers.values()].find(c => c.name === nameOrId) ?? null
  }

  private must(nameOrId: string, action: string): FakeContainer {
    this.calls.push(`${action} ${nameOrId}`)
    if (this.failing.has(action)) throw new Error(`docker ${action} failed`)
    const c = this.find(nameOrId)
    if (!c) throw new Error(`No such container: ${nameOrId}`)
    return c
  }

  byName(name: string): FakeContainer | null {
    return [...this.containers.values()].find(c => c.name === name) ?? null
  }

  async inspect(nameOrId: string) {
    const c = this.find(nameOrId)
    return c ? { ...c, env: [...c.env], mounts: c.mounts && [...c.mounts] } : null
  }

  async image(ref: string) {
    return this.images.get(this.refs.get(ref) ?? ref) ?? null
  }

  async run(spec: ContainerSpec) {
    this.calls.push(`run ${spec.name} ${spec.image}${spec.command ? ` ${spec.command.join(' ')}` : ''}`)
    if (this.failing.has('run')) throw new Error('docker run failed')
    if (this.byName(spec.name)) throw new Error(`Conflict. The container name "/${spec.name}" is already in use`)
    const id = String(this.next++).padStart(64, '0')
    const imageId = this.refs.get(spec.image) ?? spec.image
    const image = this.images.get(imageId)
    this.containers.set(id, {
      id, name: spec.name, image: imageId, reference: spec.image, running: true, command: spec.command ?? [], labels: { ...spec.labels },
      env: [...(image?.env ?? []), ...spec.env], mounts: spec.mounts, network: spec.network, capAdd: spec.capAdd, restart: spec.restart,
    })
  }

  async stop(nameOrId: string) { this.must(nameOrId, 'stop').running = false }
  async start(nameOrId: string) { this.must(nameOrId, 'start').running = true }
  async rename(nameOrId: string, to: string) {
    if (this.byName(to)) throw new Error(`Conflict: ${to} is in use`)
    this.must(nameOrId, 'rename').name = to
  }
  async remove(nameOrId: string) { this.containers.delete(this.must(nameOrId, 'remove').id) }
  async noRestart(nameOrId: string) { this.must(nameOrId, 'noRestart').restart = 'no' }

  async exec(nameOrId: string, command: string[]): Promise<RunResult> {
    const c = this.find(nameOrId)
    if (!c || !c.running || this.silent.has(c.image) || command.at(-1) !== 'answer') return { code: 1, stdout: '', stderr: 'no answer' }
    return { code: 0, stdout: `${JSON.stringify({ version: hostVersionOf(c.reference) ?? 'dev' })}\n`, stderr: '' }
  }
}
