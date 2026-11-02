/**
 * A live preview's one container: made from the template when the live preview starts, inspected before it starts and
 * removed unstarted if it differs, paused and let run again with the live preview, and removed with everything of the
 * live preview's when it stops, checked before that is reported. The image is pinned by id once inspected, so the
 * container runs exactly the image whose size was checked. What this process made is remembered by live preview; a
 * restart removes every live preview's containers (`sweep.ts`), so nothing is trusted from before it.
 */
import { agentImageName } from '../../../agents/runtime/agentImage'
import { agentNetworkName, ensureAgentNetwork, releaseAgentNetwork } from '../../../agents/runtime/containerNetwork'
import { Logger } from '../../utils/logger'
import { forgetBudget, ownContainerBudget } from './budget'
import { imageFacts, inspectContainer, listed, lpDocker } from './docker'
import { templateDifferences } from './inspect'
import { livePreviewContainerName, livePreviewFilters, type LabelledPreview } from './labels'
import { buildTemplate, createArgs, type CopyBind, type LivePreviewTemplate } from './template'

const logger = new Logger('livePreviewContainer')

/** The container differs from its template, or could not be made as it says. Nothing of it is left running. */
export class ContainerRefused extends Error {
  constructor(readonly differences: string[], message: string) {
    super(message)
  }
}

/** Something of a stopped live preview was still there after it was removed. */
export class Leftovers extends Error {
  constructor(readonly leftovers: string[]) {
    super(`Something of the live preview was left after it stopped: ${leftovers.join(', ')}`)
  }
}

type Made = { containerId: string; template: LivePreviewTemplate }
const made = new Map<string, Made>()
const allowedNetworks = new Map<string, Set<string>>()
const expected = new Map<string, number>()

/**
 * The site is about to make the live preview's containers, and the guard will watch them once they run: until the
 * answer is called, a container of it that Docker reports is the site's own, not no one's. A resume after a restart
 * makes them while the live preview reads as paused, and another live preview's watch already hears Docker.
 */
export function expectContainers(id: string): () => void {
  expected.set(id, (expected.get(id) ?? 0) + 1)
  let done = false
  return () => {
    if (done) return
    done = true
    const left = (expected.get(id) ?? 1) - 1
    if (left > 0) expected.set(id, left)
    else expected.delete(id)
  }
}

export const containersExpected = (id: string): boolean => expected.has(id)

function withAllowed(id: string, t: LivePreviewTemplate): LivePreviewTemplate {
  const extra = allowedNetworks.get(id)
  return extra?.size ? { ...t, extraNetworks: [...new Set([...(t.extraNetworks ?? []), ...extra])] } : t
}

/** The template the live preview's container was made from; null when this process made none for it. */
export function currentTemplate(id: string): LivePreviewTemplate | null {
  const m = made.get(id)
  return m ? withAllowed(id, m.template) : null
}

/** The other containers with a live preview's labels the site made: its services. Null for one the site did not make. */
type OtherContainerCheck = (id: string, containerId: string, inspect: unknown) => string[] | null
let otherContainer: OtherContainerCheck = () => null

export function setOtherContainerCheck(check: OtherContainerCheck): void {
  otherContainer = check
}

/** Joins the container to `network` (its services'); the template allows it first, so no look sees it off-template. */
export async function joinNetwork(id: string, network: string): Promise<void> {
  const set = allowedNetworks.get(id) ?? new Set<string>()
  set.add(network)
  allowedNetworks.set(id, set)
  await lpDocker(['network', 'connect', network, livePreviewContainerName(id)]).catch(err => {
    if (!/already exists|already attached|is already connected/i.test(String(err))) throw err
  })
}

export async function startContainer(lp: LabelledPreview, copy: CopyBind): Promise<{ containerId: string; name: string }> {
  await removeEverything(lp.id)
  const budget = await ownContainerBudget(lp.id, copy.hostDir)
  const image = await imageFacts(agentImageName())
  if (image.size > budget.imageBytes) {
    throw new ContainerRefused(['imageSize'], `The image is ${image.size} bytes, above the live preview's ${budget.imageBytes}.`)
  }
  const template = buildTemplate(lp, copy, budget, image.id)
  let containerId = ''
  try {
    await ensureAgentNetwork(template.name, 'livePreview')
    try {
      ;({ stdout: containerId } = await lpDocker(createArgs(template)))
    } finally {
      releaseAgentNetwork(template.name)
    }
    containerId = containerId.trim()
    if (!/^[0-9a-f]{64}$/.test(containerId)) throw new Error('docker create gave no container id')
    const differences = templateDifferences(template, await inspectContainer(containerId), image.id)
    if (differences.length > 0) {
      throw new ContainerRefused(differences, `The container did not match its template (${differences.join(', ')}), so it was removed unstarted.`)
    }
    await lpDocker(['start', containerId])
  } catch (err) {
    await removeEverything(lp.id).catch(e => logger.warn(`Could not clear live preview ${lp.id} after a failed start: ${String(e)}`))
    throw err
  }
  made.set(lp.id, { containerId, template })
  logger.info(`Started the container of live preview ${lp.id}`)
  return { containerId, name: template.name }
}

export const containerIds = (id: string): Promise<string[]> => listed(['ps', '-a', '-q', '--no-trunc', ...livePreviewFilters(id)])

/**
 * What about the live preview's containers differs from what the site made: its own container's fields against the
 * template, `missing` when it is gone, and `notMadeBySite` for any container with its labels the site did not make.
 */
export async function containerDifferences(id: string): Promise<string[]> {
  const template = currentTemplate(id)
  if (!template) return ['missing']
  const own = made.get(id)!.containerId
  const inspect = await inspectContainer(template.name)
  const differences = inspect ? templateDifferences(template, inspect, template.image) : ['missing']
  if (inspect && (inspect as { Id?: unknown }).Id !== own) differences.push('notMadeBySite')
  for (const other of (await containerIds(id)).filter(c => c !== own)) {
    differences.push(...(otherContainer(id, other, await inspectContainer(other)) ?? ['notMadeBySite']))
  }
  return [...new Set(differences)]
}

/** The container, running and as its template says, for an exec; throws otherwise. */
export async function runningContainer(id: string): Promise<string> {
  const differences = await containerDifferences(id)
  if (differences.length) throw new ContainerRefused(differences, `The live preview's container is not as the site made it (${differences.join(', ')}).`)
  const inspect = await inspectContainer(livePreviewContainerName(id)) as { Id: string; State?: { Running?: unknown; Paused?: unknown } }
  if (inspect.State?.Running !== true || inspect.State?.Paused === true) throw new ContainerRefused(['notRunning'], 'The live preview\'s container is not running.')
  return inspect.Id
}

export async function pauseContainers(id: string): Promise<void> {
  for (const c of await containerIds(id)) {
    await lpDocker(['pause', c]).catch(err => {
      if (!/already paused|is not running/i.test(String(err))) throw err
    })
  }
}

/** Lets paused containers run again, only when they still match their template. */
export async function unpauseContainers(id: string): Promise<void> {
  const differences = await containerDifferences(id)
  if (differences.length) throw new ContainerRefused(differences, `The live preview's container changed while it was paused (${differences.join(', ')}), so it was not let run again.`)
  for (const c of await containerIds(id)) {
    await lpDocker(['unpause', c]).catch(err => {
      if (!/is not paused/i.test(String(err))) throw err
    })
  }
}

/** Removes the live preview's containers, by label and by name, and its networks. Does not check. */
export async function removeEverything(id: string): Promise<void> {
  const name = livePreviewContainerName(id)
  for (const c of await containerIds(id)) await lpDocker(['rm', '-f', c])
  await lpDocker(['rm', '-f', name]).catch(err => {
    if (!/no such container/i.test(String(err))) throw err
  })
  const networks = new Set(await listed(['network', 'ls', '-q', ...livePreviewFilters(id)]))
  const byName = await lpDocker(['network', 'inspect', '--format', '{{.Id}}', agentNetworkName(name)]).then(r => r.stdout.trim(), () => '')
  if (byName) networks.add(byName)
  const self = process.env.SITE_CONTAINER_NAME
  for (const network of networks) {
    if (self) {
      await lpDocker(['network', 'disconnect', '--force', network, self]).catch(err => {
        if (!/is not connected|no such/i.test(String(err))) throw err
      })
    }
    await lpDocker(['network', 'rm', network]).catch(err => {
      if (!/no such network|not found/i.test(String(err))) throw err
    })
  }
  made.delete(id)
  allowedNetworks.delete(id)
  forgetBudget(id)
}

export async function leftovers(id: string): Promise<string[]> {
  const left: string[] = []
  for (const c of await containerIds(id)) left.push(`container ${c.slice(0, 12)}`)
  if (await inspectContainer(livePreviewContainerName(id))) left.push(`container ${livePreviewContainerName(id)}`)
  for (const n of await listed(['network', 'ls', '-q', ...livePreviewFilters(id)])) left.push(`network ${n.slice(0, 12)}`)
  return left
}

export async function stopContainers(id: string): Promise<void> {
  await removeEverything(id)
  const left = await leftovers(id)
  if (left.length) throw new Leftovers(left)
}

export function forgetMadeForTests(): void {
  made.clear()
  allowedNetworks.clear()
  expected.clear()
}
