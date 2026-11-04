/**
 * A live preview's services (live preview spec section 4, *Services*): what the copy's services file declares, started
 * by the site, each as a container of its own from the fixed template, on an internal network of their own beside the
 * live preview's container.
 *
 * - **When an app starts** (`ensurePreviewServices`), the file is read again; every declared service whose declaration
 *   a person approved in HQ runs (kept in the site's database, `serviceApprovals.ts`), in the order `depends_on` gives, each waited for until it is ready. A new or changed
 *   one is `waiting` until a person says yes to exactly its declaration's hash (`approveService`, from `livePreview.act`
 *   `service.start`); a changed one that ran is stopped meanwhile.
 * - **The live preview pausing and stopping** acts on every container with its labels, services among them.
 *
 * A service's template is registered before its container is made, so the guard, which sees every container with the
 * live preview's labels, checks it against that template from its first event on, and stops it on any difference.
 */
import {
  serviceDeclarationHash, type LivePreviewServicesEvent, type ServiceDeclaration, type ServiceProblem as Problem,
  type ServiceStatus,
} from '@agenthix/core'
import { Logger } from '../../utils/logger'
import { labelKey } from '../../../agents/runtime/containerLabels'
import type { LivePreviewBudget } from '../container/budget'
import { livePreviewLabels, type LabelledPreview } from '../container/labels'
import { ServiceProblem, workspaceVolumeLabel, type ServiceDocker } from './serviceDocker'
import { createdDifferences } from './serviceInspect'
import { buildServiceTemplate, serviceCreateArgs, servicesNetworkName, type ServiceTemplate } from './serviceTemplate'
import { needsPasswd, serviceBudget, serviceUser } from './serviceUser'
import type { ServicesRead } from './readServices'
import { readyWithin, startOrder, waitFinished, waitReady } from './serviceReady'
import { approvalKey, type ServiceApprovals } from './serviceApprovals'

const logger = new Logger('livePreviewServices')

/** The live preview whose services these are, with its copy's folder on this disk. */
type Preview = LabelledPreview & { hostDir: string }

export type ServicesDeps = {
  docker: ServiceDocker
  read(lp: Preview): Promise<ServicesRead>
  /** Joins the live preview's own container to its services network. */
  joinPreview(lp: Preview, network: string): Promise<void>
  /** The services' share of the live preview's budget; null when its container holds the whole of it. */
  pool(lp: Preview): LivePreviewBudget | null
  tell(event: LivePreviewServicesEvent): void
  approvals: ServiceApprovals
  now(): number
  sleep(ms: number): Promise<void>
}

type Running = { template: ServiceTemplate; hash: string; containerId: string | null }
type PreviewServiceSet = { lp: Preview; statuses: Map<string, ServiceStatus>; running: Map<string, Running>; problems: Problem[]; chain: Promise<unknown> }

const previews = new Map<string, PreviewServiceSet>()

export type EnsureResult =
  | { ok: true; services: ServiceStatus[] }
  | { ok: false; refused: 'servicesRefused'; detail: string; problems: Problem[] }

function stateOf(lp: Preview): PreviewServiceSet {
  let s = previews.get(lp.id)
  if (!s) {
    s = { lp, statuses: new Map(), running: new Map(), problems: [], chain: Promise.resolve() }
    previews.set(lp.id, s)
  }
  return s
}

function serial<T>(s: PreviewServiceSet, fn: () => Promise<T>): Promise<T> {
  const run = s.chain.then(fn)
  s.chain = run.catch(() => {})
  return run
}

const sorted = (s: PreviewServiceSet) => [...s.statuses.values()].sort((a, b) => (a.name < b.name ? -1 : 1))

function tell(deps: ServicesDeps, s: PreviewServiceSet): void {
  deps.tell({ livePreviewId: s.lp.id, services: sorted(s), problems: s.problems, at: new Date(deps.now()).toISOString() })
}

function set(s: PreviewServiceSet, d: ServiceDeclaration, hash: string, state: ServiceStatus['state'], detail: string | null = null): void {
  s.statuses.set(d.name, { name: d.name, state, declarationHash: hash, declaration: d, detail })
}

async function removeRunning(deps: ServicesDeps, s: PreviewServiceSet, name: string): Promise<void> {
  const r = s.running.get(name)
  if (!r) return
  await deps.docker.remove(r.template.name)
  s.running.delete(name)
}

export const WAITING = 'New or changed since it was last approved: it starts once a person says yes to it in HQ.'

export async function ensurePreviewServices(lp: Preview, deps: ServicesDeps): Promise<EnsureResult> {
  const s = stateOf(lp)
  return serial(s, async () => {
    const read = await deps.read(lp)
    // The file could not be looked at for a moment: what runs keeps running, and only this start is refused.
    if (read.kind === 'unreadable') return { ok: false, refused: 'servicesRefused', detail: read.detail, problems: s.problems }
    if (read.kind !== 'declared') {
      for (const name of [...s.running.keys()]) await removeRunning(deps, s, name)
      s.statuses.clear()
      s.problems = read.kind === 'refused' ? read.problems : []
      tell(deps, s)
      if (read.kind === 'absent') return { ok: true, services: [] }
      return { ok: false, refused: 'servicesRefused', detail: 'The services file was refused; fix what each problem says, then start the app again.', problems: s.problems }
    }
    s.problems = []
    const hashes = new Map(await Promise.all(read.services.map(async d => [d.name, await serviceDeclarationHash(d)] as const)))
    for (const [name, r] of [...s.running]) if (hashes.get(name) !== r.hash) await removeRunning(deps, s, name)
    for (const name of [...s.statuses.keys()]) if (!hashes.has(name)) s.statuses.delete(name)
    const approved = await deps.approvals.approved(lp.workspaceId)
    for (const d of startOrder(read.services)) {
      const hash = hashes.get(d.name)!
      if (!approved.has(approvalKey(d.name, hash))) {
        set(s, d, hash, 'waiting', WAITING)
        continue
      }
      const blocked = await firstUnmet(deps, s, d)
      if (blocked) {
        const dep = s.statuses.get(blocked[0])
        set(s, d, hash, dep?.state === 'waiting' ? 'waiting' : 'failed', `It needs ${blocked[0]}, which is ${dep?.state ?? 'not declared'}.`)
        continue
      }
      await startService(deps, s, d, hash, read.services.length)
    }
    tell(deps, s)
    return { ok: true, services: sorted(s) }
  })
}

const FINISHED = 'It ran and finished.'

/** The first dependency of `d` not met by its condition: running, or for one that runs once, finished well. */
async function firstUnmet(deps: ServicesDeps, s: PreviewServiceSet, d: ServiceDeclaration): Promise<[string, string] | undefined> {
  for (const [dep, condition] of d.dependsOn) {
    const st = s.statuses.get(dep)
    if (condition === 'service_completed_successfully') {
      const r = s.running.get(dep)
      if (st?.state === 'running' && r && await waitFinished(deps, r.template, readyWithin(r.template))) {
        s.statuses.set(dep, { ...st, state: 'stopped', detail: FINISHED })
      }
      if (s.statuses.get(dep)?.detail !== FINISHED) return [dep, condition]
    } else if (st?.state !== 'running') return [dep, condition]
  }
  return undefined
}

async function startService(deps: ServicesDeps, s: PreviewServiceSet, d: ServiceDeclaration, hash: string, declared: number): Promise<void> {
  const running = s.running.get(d.name)
  if (running) {
    const state = await deps.docker.state(running.template.name).catch(() => null)
    if (state?.running) {
      set(s, d, hash, 'running')
      return
    }
    await removeRunning(deps, s, d.name)
  }
  set(s, d, hash, 'starting')
  tell(deps, s)
  try {
    const template = await makeService(deps, s, d, hash, declared)
    const ready = await waitReady(deps, template, readyWithin(template))
    if (ready === 'finished') set(s, d, hash, 'stopped', FINISHED)
    else if (ready === 'ready') set(s, d, hash, 'running')
    else throw new ServiceProblem(ready)
  } catch (err) {
    const detail = err instanceof ServiceProblem ? err.message : `${d.name} could not start on this site.`
    if (!(err instanceof ServiceProblem)) logger.error(`Service ${d.name} of live preview ${s.lp.id} could not start: ${String(err)}`)
    await removeRunning(deps, s, d.name).catch(() => undefined)
    set(s, d, hash, 'failed', detail)
  }
}

async function makeService(deps: ServicesDeps, s: PreviewServiceSet, d: ServiceDeclaration, hash: string, declared: number): Promise<ServiceTemplate> {
  const { lp } = s
  const pool = deps.pool(lp)
  if (!pool) {
    throw new ServiceProblem('This live preview started before its branch declared services, so its container holds the whole of its budget. Stop the live preview and start it again to run services.')
  }
  const network = servicesNetworkName(lp.id)
  await deps.docker.ensureNetwork(network, { ...livePreviewLabels(lp, 'live-preview-service'), [labelKey('live-preview-services')]: 'true' })
  await deps.joinPreview(lp, network)
  const had = await deps.docker.image(d.image).then(() => true, () => false)
  await deps.docker.pull(d.image, pool.imageBytes)
  const image = await deps.docker.image(d.image)
  if (image.size > pool.imageBytes) {
    // Pulled for this service alone, so it goes: a refused image keeps none of the machine's disk.
    if (!had) await deps.docker.removeImage(d.image).catch(err => logger.warn(`The refused image ${d.image} could not be removed: ${String(err)}`))
    throw new ServiceProblem(`The image ${d.image} is ${image.size} bytes, above the live preview's ${pool.imageBytes}.`)
  }
  const user = serviceUser(image, d.image, needsPasswd(image) ? await deps.docker.passwd(image.id) : null)
  const budget = serviceBudget(pool, declared, [...s.running.values()].map(r => r.template.budget))
  if (!budget) throw new ServiceProblem('The live preview\'s budget for services is spent; declare fewer services.')
  const template = buildServiceTemplate({ lp, declaration: d, image, user, budget })
  if (template.volume) await deps.docker.ensureVolume(template.volume.name, workspaceVolumeLabel(lp.workspaceId))
  await deps.docker.remove(template.name)
  // Registered before it exists, so the guard checks it against this template from its first event.
  const entry: Running = { template, hash, containerId: null }
  s.running.set(d.name, entry)
  const id = await deps.docker.create(serviceCreateArgs(template))
  entry.containerId = id
  const differences = createdDifferences(template, await deps.docker.inspect(id))
  if (differences.length) {
    throw new ServiceProblem(`${d.name}'s container did not match its template (${differences.join(', ')}), so it was removed unstarted.`)
  }
  await deps.docker.start(id)
  return template
}

export async function stopPreviewServices(lp: Preview, deps: ServicesDeps): Promise<void> {
  const s = previews.get(lp.id)
  if (!s) return
  await serial(s, async () => {
    for (const name of [...s.running.keys()]) await removeRunning(deps, s, name)
    for (const st of s.statuses.values()) if (st.state !== 'waiting') s.statuses.set(st.name, { ...st, state: 'stopped', detail: null })
    tell(deps, s)
  })
}

export type ApproveResult = { ok: true } | { ok: false; code: 'unknownService' | 'serviceChanged' | 'servicesRefused'; message: string }

/** A person's `service.start` in HQ: their yes to exactly this declaration, which then starts. */
export async function approveService(lp: Preview, service: string, declarationHash: string, deps: ServicesDeps): Promise<ApproveResult> {
  const read = await deps.read(lp)
  if (read.kind !== 'declared') {
    return { ok: false, code: 'servicesRefused', message: 'The branch\'s services file has no services this site can start now.' }
  }
  const d = read.services.find(x => x.name === service)
  if (!d) return { ok: false, code: 'unknownService', message: `The services file declares no service named ${service}.` }
  if ((await serviceDeclarationHash(d)) !== declarationHash) {
    return { ok: false, code: 'serviceChanged', message: `${service} changed in the services file since you looked. Look again.` }
  }
  await deps.approvals.approve(lp.workspaceId, service, declarationHash)
  void ensurePreviewServices(lp, deps).catch(err => logger.error(`Services of live preview ${lp.id} could not start: ${String(err)}`))
  return { ok: true }
}

export function previewServiceStatuses(id: string): ServiceStatus[] {
  const s = previews.get(id)
  return s ? sorted(s) : []
}

/** The ports the live preview's declared services expose, for an app's start to refuse (`portTaken`). */
export function previewServiceProblems(id: string): Problem[] {
  return previews.get(id)?.problems ?? []
}

export function previewServicePorts(id: string): Set<number> {
  return new Set(previewServiceStatuses(id).flatMap(st => st.declaration.expose))
}

function templateNamed(id: string, containerName: string): ServiceTemplate | null {
  for (const r of previews.get(id)?.running.values() ?? []) if (r.template.name === containerName) return r.template
  return null
}

export const serviceTemplateNamed = templateNamed

/** Everything of the live preview's services forgotten: it stopped, and its containers and network went with it. */
export function forgetPreviewServices(id: string): void {
  previews.delete(id)
}

/** The services' volumes of a workspace removed from this site, which hold the services' data. */
export async function removeWorkspaceServices(workspaceId: string, docker: ServiceDocker): Promise<void> {
  const label = workspaceVolumeLabel(workspaceId)
  await docker.removeVolumes(Object.entries(label).map(([k, v]) => `${k}=${v}`))
}

export function resetPreviewServicesForTests(): void {
  previews.clear()
}
