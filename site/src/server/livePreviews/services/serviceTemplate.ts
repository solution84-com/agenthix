/**
 * The one template every service container is made from (spec part 4, *How a service runs*; D44, D49), and the
 * `docker create` arguments that make it. Pure: the declaration only fills its blanks (image, command, environment,
 * health check, the one named volume); everything else is fixed here. The site checks what Docker made against the
 * same template before starting it (`serviceInspect.ts`), and the guard keeps checking while it runs.
 *
 * Fixed: no capability, no new privileges, the default seccomp profile, a read-only root with only its data volume and
 * memory-backed temporary folders writable, an ordinary user, a share of the live preview's budget, no restart policy, fixed
 * logging, Docker's own IPC namespace, IPv6 off, and only the live preview's services network, which the site is not on.
 */
import type { ServiceDeclaration, ServiceHealthcheck } from '@agenthix/core'
import { labelKey, siteNamespace } from '../../../agents/runtime/containerLabels'
import { budgetArgs, type LivePreviewBudget } from '../container/budget'
import { ipv6OffSysctls, sysctlArgs } from '../../../agents/runtime/ipv6Off'
import { livePreviewContainerName, livePreviewLabels, type LabelledPreview } from '../container/labels'

/** What `docker image inspect` says of a service's image, as far as the template needs it. */
export type ServiceImage = {
  id: string
  size: number
  /** The image's own user, as written; empty for root. */
  user: string
  env: string[]
  cmd: string[] | null
  entrypoint: string[] | null
  /** Folders the image declares as volumes; each gets a memory-backed folder, so Docker makes no volume of its own. */
  volumes: string[]
  /** The image's own health check (`['CMD-SHELL', ...]` or `['CMD', ...]`), or null. */
  healthcheck: string[] | null
}

export type ServiceTemplate = {
  service: string
  name: string
  /** The image's id: the container runs exactly the image whose size was checked. */
  image: string
  labels: Record<string, string>
  user: string
  network: string
  volume: { name: string; target: string; readOnly: boolean } | null
  /** `NAME=value`, the image's own with the declaration's over them, as Docker reports them. */
  env: string[]
  /** What the declaration passes to `docker create`, in order. */
  declaredEnv: [string, string][]
  /** The command given, or null for the image's own. */
  command: string[] | null
  cmd: string[] | null
  entrypoint: string[] | null
  /** The health check Docker runs in it, as its exec event names it; null for none. */
  healthCommand: string | null
  healthcheck: ServiceHealthcheck | null
  imageHealthcheck: string[] | null
  capAdd: string[]
  /** IPv6 off, as Docker reports it (`ipv6Off.ts`). */
  sysctls: Record<string, string>
  tmpfs: Record<string, string>
  budget: LivePreviewBudget
}

export const serviceLabelKey = (): string => labelKey('live-preview-service')
export const serviceVolumeLabelKey = (): string => labelKey('service-volume')

/** `<namespace>-live-preview-<id>-svc-<service>`: a service's names are lower-case letters, digits and dashes. */
export function serviceContainerName(id: string, service: string): string {
  return `${livePreviewContainerName(id)}-svc-${service}`
}

/** The live preview's services network: its services and its own container; never the site. */
export function servicesNetworkName(id: string): string {
  return `${livePreviewContainerName(id)}-services`
}

/** A workspace's named volume: the site's own name for it, kept with the workspace. */
export function serviceVolumeName(workspaceId: string, volume: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(workspaceId)) throw new Error('Refusing a volume for an unsafe workspace id')
  return `${siteNamespace()}-ws-${workspaceId}-${volume}`
}

export function serviceLabels(lp: LabelledPreview, service: string): Record<string, string> {
  return { ...livePreviewLabels(lp, 'live-preview-service'), [serviceLabelKey()]: service }
}

/** A word as `sh` reads it back: single-quoted, each quote closed and escaped. */
const shellWord = (w: string) => `'${w.replace(/'/g, `'\\''`)}'`

/**
 * Docker's command line takes a health check as one shell command; an exec form (`CMD`) is quoted word by word, so
 * the shell runs exactly those words. Docker runs it as `/bin/sh -c <command>`, which its exec event names.
 */
export function healthShellCommand(test: string[]): string {
  return test[0] === 'CMD-SHELL' ? test[1] : test.slice(1).map(shellWord).join(' ')
}

function healthCommandOf(declared: ServiceHealthcheck | null, image: string[] | null): string | null {
  if (declared) return `/bin/sh -c ${healthShellCommand(declared.test)}`
  if (!image || image[0] === 'NONE') return null
  return image[0] === 'CMD-SHELL' ? `/bin/sh -c ${image[1]}` : image.slice(1).join(' ')
}

/** `/tmp`, `/run` and every folder the image declares as a volume, each a share of the service's disk budget. */
export function serviceTmpfs(budget: LivePreviewBudget, imageVolumes: string[], volumeTarget: string | null): Record<string, string> {
  const paths = [...new Set(['/tmp', '/run', ...imageVolumes.filter(v => v !== volumeTarget)])]
  const size = Math.max(1024 * 1024, Math.floor(budget.diskBytes / paths.length))
  return Object.fromEntries(paths.map(p => [p, `rw,noexec,nosuid,nodev,size=${size},mode=1777`]))
}

function mergedEnv(image: string[], declared: [string, string][]): string[] {
  const env = new Map<string, string>()
  for (const e of image) {
    const i = e.indexOf('=')
    env.set(i < 0 ? e : e.slice(0, i), e)
  }
  for (const [k, v] of declared) env.set(k, `${k}=${v}`)
  return [...env.values()]
}

export function buildServiceTemplate(input: {
  lp: LabelledPreview
  declaration: ServiceDeclaration
  image: ServiceImage
  user: string
  budget: LivePreviewBudget
}): ServiceTemplate {
  const { lp, declaration: d, image } = input
  const volume = d.volume && { name: serviceVolumeName(lp.workspaceId, d.volume.name), target: d.volume.target, readOnly: d.volume.readOnly }
  return {
    service: d.name,
    name: serviceContainerName(lp.id, d.name),
    image: image.id,
    labels: serviceLabels(lp, d.name),
    user: input.user,
    network: servicesNetworkName(lp.id),
    volume,
    env: mergedEnv(image.env, d.environment),
    declaredEnv: d.environment,
    command: d.command,
    cmd: d.command ?? image.cmd,
    entrypoint: image.entrypoint,
    healthCommand: healthCommandOf(d.healthcheck, image.healthcheck),
    healthcheck: d.healthcheck,
    imageHealthcheck: image.healthcheck,
    capAdd: [],
    sysctls: ipv6OffSysctls(),
    tmpfs: serviceTmpfs(input.budget, image.volumes, volume?.target ?? null),
    budget: input.budget,
  }
}

const UNSAFE_PATH = /[,"'\n\r\0]/

function healthArgs(h: ServiceHealthcheck | null): string[] {
  if (!h) return []
  const ms = (flag: string, v: number) => (v > 0 ? [flag, `${v}ms`] : [])
  return [
    '--health-cmd', healthShellCommand(h.test),
    ...ms('--health-interval', h.intervalMs), ...ms('--health-timeout', h.timeoutMs), ...ms('--health-start-period', h.startPeriodMs),
    '--health-retries', String(h.retries),
  ]
}

/** `docker create` for the template: made, not started, so it can be checked before it runs. */
export function serviceCreateArgs(t: ServiceTemplate): string[] {
  if (t.volume && (!t.volume.target.startsWith('/') || UNSAFE_PATH.test(t.volume.target))) {
    throw new Error(`Refusing a service volume with an unusable path: ${JSON.stringify(t.volume.target)}`)
  }
  for (const p of Object.keys(t.tmpfs)) if (UNSAFE_PATH.test(p) || p.includes(':')) throw new Error(`Refusing a folder: ${JSON.stringify(p)}`)
  return [
    'create',
    '--pull', 'never',
    '--name', t.name,
    '--network', t.network,
    '--network-alias', t.service,
    '--user', t.user,
    ...Object.entries(t.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
    ...(t.volume ? ['--mount', `type=volume,source=${t.volume.name},target=${t.volume.target}${t.volume.readOnly ? ',readonly' : ''}`] : []),
    ...Object.entries(t.tmpfs).flatMap(([p, opts]) => ['--tmpfs', `${p}:${opts}`]),
    '--cap-drop', 'ALL',
    ...t.capAdd.flatMap(c => ['--cap-add', c]),
    '--security-opt', 'no-new-privileges',
    ...sysctlArgs(t.sysctls),
    '--read-only',
    '--ipc', 'private',
    '--restart', 'no',
    ...budgetArgs(t.budget),
    ...t.declaredEnv.flatMap(([k, v]) => ['--env', `${k}=${v}`]),
    ...healthArgs(t.healthcheck),
    t.image,
    ...(t.command ?? []),
  ]
}
