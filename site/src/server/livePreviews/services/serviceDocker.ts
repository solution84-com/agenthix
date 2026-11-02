/**
 * What the services ask of Docker (spec part 4, S14), as one interface the tests replace. Images are pulled by the
 * site, by DNS name, from a registry that resolves to public addresses only, with no registry credentials (an empty
 * client configuration), and held to the live preview's image size cap twice: by the layers its manifest lists for this
 * computer, before anything is pulled, and by the size Docker reports once it is. A service's ordinary user is found in the image's own
 * files without running anything of it. Its volume is the site's: local, without options, labelled with its workspace.
 */
import dns from 'node:dns/promises'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { checkImage } from '@agenthix/core'
import { docker, within } from '../../../agents/runtime/containerLifecycle'
import { composeProjectLabelArgs, labelKey } from '../../../agents/runtime/containerLabels'
import { createInternalPreviewNetwork, insideAgentRange } from '../../../agents/runtime/containerNetwork'
import { makeNonPublicCheck } from '../../../executor/egress/program/addressPolicy'
import { helperLabel } from '../../branches/helperContainer'
import type { ServiceImage } from './serviceTemplate'
import { serviceVolumeLabelKey } from './serviceTemplate'

const CALL_MS = 30_000
const PULL_MS = 10 * 60_000
/** `docker manifest inspect --verbose` reads every platform's manifest in turn: half a minute for a common image. */
const MANIFEST_MS = 3 * 60_000

/** A refusal the person reads in the service's state. */
export class ServiceProblem extends Error {}

export type ServiceRunState = { running: boolean; exitCode: number | null; health: 'none' | 'starting' | 'healthy' | 'unhealthy' }

export type ServiceDocker = {
  /** Refuses, before pulling, an image whose layers for this site add up to more than `maxBytes`. */
  pull(image: string, maxBytes: number): Promise<void>
  image(image: string): Promise<ServiceImage>
  /** The image's `/etc/passwd`, read from a container made of it and never started; null when it has none. */
  passwd(imageId: string): Promise<string | null>
  ensureNetwork(name: string, labels: Record<string, string>): Promise<void>
  /** Makes the volume if missing; refuses one that exists without the workspace's label or with options. */
  ensureVolume(name: string, workspaceLabel: Record<string, string>): Promise<void>
  create(args: string[]): Promise<string>
  inspect(ref: string): Promise<unknown | null>
  start(id: string): Promise<void>
  remove(ref: string): Promise<void>
  /** Removes the image's name, and the image when nothing else names or uses it; never forced. */
  removeImage(image: string): Promise<void>
  state(ref: string): Promise<ServiceRunState | null>
  /** Removes every volume with all of these labels (`key=value`). */
  removeVolumes(labels: string[]): Promise<void>
}

const call = (args: string[], ms = CALL_MS, env?: Record<string, string>) => within(docker(args, env), ms, `docker ${args[0]}`)
const isNonPublic = makeNonPublicCheck(net)

/** Docker's rule for where an image comes from: a first part with a dot is a registry; otherwise Docker Hub. */
export function registryHost(image: string): string {
  const parts = image.split('@')[0].split('/')
  return parts.length > 1 && parts[0].includes('.') ? parts[0] : 'registry-1.docker.io'
}

/** S14: the registry's name must lead only to public addresses. */
export async function checkRegistry(image: string, lookup = (h: string) => dns.lookup(h, { all: true })): Promise<void> {
  const host = registryHost(image)
  const addresses = await lookup(host).catch(() => [])
  if (!addresses.length) throw new ServiceProblem(`The registry ${host} could not be reached from this site.`)
  if (addresses.some(a => isNonPublic(a.address))) {
    throw new ServiceProblem(`The registry ${host} is not on the public internet; services come from public registries only.`)
  }
}

/** A /28: the live preview's container and up to ten services, beside the network's own addresses and its gateway. */
export const SERVICES_NETWORK_BITS = 28

/** An existing services network is used only when it is internal, IPv4 only, and wholly inside the agent range. */
export function servicesNetworkHolds(inspected: Record<string, unknown>): boolean {
  const config = ((inspected.IPAM as { Config?: unknown } | undefined)?.Config ?? []) as { Subnet?: unknown }[]
  const subnets = Array.isArray(config) ? config.map(c => c?.Subnet).filter((x): x is string => typeof x === 'string') : []
  return inspected.Internal === true && inspected.EnableIPv6 !== true && insideAgentRange(subnets)
}

/** Docker's name for this site's architecture, which the site shares with the daemon it runs beside. */
export function dockerArch(arch: string = process.arch): string {
  return ({ x64: 'amd64', ia32: '386', arm64: 'arm64', arm: 'arm', ppc64: 'ppc64le', s390x: 's390x', riscv64: 'riscv64' } as Record<string, string>)[arch] ?? arch
}

/**
 * The bytes of the layers `docker manifest inspect --verbose` lists for `arch` on Linux: one manifest, or the one of a
 * list for this site. Null when none is for it or the answer is not one.
 */
export function manifestLayerBytes(raw: unknown, arch: string): number | null {
  const all = (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[]
  const platformOf = (e: Record<string, unknown>) => ((e?.Descriptor as Record<string, unknown> | undefined)?.platform ?? null) as Record<string, unknown> | null
  const entry = Array.isArray(raw)
    ? all.find(e => platformOf(e)?.os === 'linux' && platformOf(e)?.architecture === arch)
    : all[0]
  const manifest = (entry?.SchemaV2Manifest ?? entry?.OCIManifest) as { layers?: unknown } | undefined
  if (!manifest || !Array.isArray(manifest.layers)) return null
  let total = 0
  for (const layer of manifest.layers as { size?: unknown }[]) {
    if (typeof layer?.size !== 'number' || !Number.isSafeInteger(layer.size) || layer.size < 0) return null
    total += layer.size
  }
  return total
}

function strings(v: unknown): string[] | null {
  return Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : null
}

export function readImage(raw: unknown): ServiceImage {
  const top = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined
  const config = (top?.Config ?? {}) as Record<string, unknown>
  const id = top?.Id
  const size = top?.Size
  if (typeof id !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(id) || typeof size !== 'number') throw new Error('docker could not describe the image')
  const health = (config.Healthcheck ?? null) as Record<string, unknown> | null
  return {
    id,
    size,
    user: typeof config.User === 'string' ? config.User : '',
    env: strings(config.Env) ?? [],
    cmd: strings(config.Cmd),
    entrypoint: strings(config.Entrypoint),
    volumes: Object.keys((config.Volumes ?? {}) as Record<string, unknown>).filter(v => v.startsWith('/')),
    healthcheck: health ? strings(health.Test) : null,
  }
}

/** The first regular file in a tar stream, as text; enough for `docker cp <container>:/etc/passwd -`. */
export function firstTarFile(tar: string): string | null {
  if (tar.length < 512) return null
  const type = tar[156]
  if (type !== '0' && type !== '\0') return null
  const size = parseInt(tar.slice(124, 136).replace(/\0.*$/s, '').trim(), 8)
  if (!Number.isFinite(size) || size < 0 || size > 1024 * 1024) return null
  return tar.slice(512, 512 + size)
}

export const cliServiceDocker: ServiceDocker = {
  async pull(image, maxBytes) {
    if (typeof checkImage(image) === 'string') throw new ServiceProblem(`${image} is not an image named by DNS name.`)
    await checkRegistry(image)
    // An empty client configuration: no registry credential of the machine's is ever used for a service.
    const config = await fs.mkdtemp(path.join(os.tmpdir(), 'service-pull-'))
    try {
      const listed = await call(['manifest', 'inspect', '--verbose', image], MANIFEST_MS, { DOCKER_CONFIG: config })
        .then(r => manifestLayerBytes(JSON.parse(r.stdout), dockerArch()))
        .catch(() => null)
      if (listed === null) throw new ServiceProblem(`The size of ${image} for this site could not be read before pulling it, so it was not pulled.`)
      if (listed > maxBytes) throw new ServiceProblem(`The image ${image} is ${listed} bytes, above the live preview's ${maxBytes}; it was not pulled.`)
      await call(['pull', '--quiet', image], PULL_MS, { DOCKER_CONFIG: config })
    } catch (err) {
      if (err instanceof ServiceProblem) throw err
      throw new ServiceProblem(`The image ${image} could not be pulled: ${String(err).split('\n')[0].slice(0, 200)}`)
    } finally {
      await fs.rm(config, { recursive: true, force: true })
    }
  },
  async image(image) {
    return readImage(JSON.parse((await call(['image', 'inspect', image])).stdout))
  },
  async passwd(imageId) {
    const { stdout } = await call([
      'create', '--pull', 'never', '--network', 'none', '--label', `${helperLabel()}=image`, ...composeProjectLabelArgs('commit-helper'),
      '--entrypoint', '/nonexistent', imageId,
    ])
    const id = stdout.trim()
    try {
      return firstTarFile((await call(['cp', `${id}:/etc/passwd`, '-'])).stdout)
    } catch {
      return null
    } finally {
      await call(['rm', '-f', id]).catch(() => undefined)
    }
  },
  async ensureNetwork(name, labels) {
    const found = await call(['network', 'inspect', name]).then(r => JSON.parse(r.stdout)[0] as Record<string, unknown>, () => null)
    if (found) {
      if (!servicesNetworkHolds(found)) {
        throw new ServiceProblem(`The network ${name} on this site is not one the site made for the live preview's services; it is not used.`)
      }
      return
    }
    // Internal: services reach each other and the live preview's container, and nothing outside the live preview reaches them. Inside
    // the agent range, so the machine's agent protections cover the live preview's container and the services on it too.
    await createInternalPreviewNetwork(name, SERVICES_NETWORK_BITS, labels)
  },
  async ensureVolume(name, workspaceLabel) {
    const found = await call(['volume', 'inspect', name]).then(r => JSON.parse(r.stdout)[0] as Record<string, unknown>, () => null)
    if (found) {
      const labels = (found.Labels ?? {}) as Record<string, string>
      const options = found.Options as Record<string, unknown> | null
      const ours = Object.entries(workspaceLabel).every(([k, v]) => labels[k] === v)
      if (!ours || found.Driver !== 'local' || (options && Object.keys(options).length)) {
        throw new ServiceProblem(`A volume named ${name} exists on this site that the site did not make; it is not used.`)
      }
      return
    }
    await call(['volume', 'create', '--driver', 'local', ...Object.entries(workspaceLabel).flatMap(([k, v]) => ['--label', `${k}=${v}`]), name])
  },
  async create(args) {
    const id = (await call(args)).stdout.trim()
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('docker create gave no container id')
    return id
  },
  async inspect(ref) {
    try {
      const parsed: unknown = JSON.parse((await call(['inspect', '--type', 'container', ref])).stdout)
      return Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null
    } catch (err) {
      if (/no such (object|container)/i.test(String(err))) return null
      throw err
    }
  },
  async start(id) {
    await call(['start', id])
  },
  async remove(ref) {
    await call(['rm', '-f', ref]).catch(err => {
      if (!/no such container/i.test(String(err))) throw err
    })
  },
  async removeImage(image) {
    await call(['image', 'rm', image]).catch(err => {
      if (!/no such image/i.test(String(err))) throw err
    })
  },
  async state(ref) {
    const raw = await this.inspect(ref) as { State?: Record<string, unknown> } | null
    const s = raw?.State
    if (!s) return null
    const health = (s.Health as { Status?: unknown } | undefined)?.Status
    return {
      running: s.Running === true && s.Paused !== true,
      exitCode: s.Running === true ? null : typeof s.ExitCode === 'number' ? s.ExitCode : null,
      health: health === 'starting' || health === 'healthy' || health === 'unhealthy' ? health : 'none',
    }
  },
  async removeVolumes(labels) {
    if (!labels.length) return
    const { stdout } = await call(['volume', 'ls', '-q', ...labels.flatMap(l => ['--filter', `label=${l}`])])
    for (const v of stdout.split('\n').map(s => s.trim()).filter(Boolean)) await call(['volume', 'rm', '-f', v]).catch(() => undefined)
  },
}

export const workspaceVolumeLabel = (workspaceId: string): Record<string, string> => ({
  [serviceVolumeLabelKey()]: 'true',
  [labelKey('workspace')]: workspaceId,
})
