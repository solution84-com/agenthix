/**
 * What a project's own model list starts with and how it reads (Settings › Models): the first switch to *Only these*
 * is pre-filled with the models the project's agents use now, so switching it on stops nothing; anyone in the project
 * reads what is allowed there as one line.
 */
import { prisma } from 'wasp/server'
import type { ModelListEntry } from '@agenthix/core'
import { decide } from '../routing/decide'
import { makerAndName } from '../routing/modelKeys'
import { placeOfProject } from '../routing/place'
import { readSnapshot } from '../routing/snapshot'
import type { ListInput } from './modelLists'
import type { ListView, ReachableModel } from './types'

/**
 * The models the project's agents would run on now, each once, by the key lists match: each agent's one default,
 * which its conversations start on and their work takes.
 */
export async function modelsInUse(projectId: string): Promise<string[]> {
  const place = await placeOfProject(projectId)
  const agents = await prisma.projectAgent.findMany({ where: { projectId }, select: { agentId: true } })
  const keys = new Set<string>()
  for (const { agentId } of agents) {
    const req = { purpose: 'conversation' as const, place, agentId }
    const answer = decide(req, await readSnapshot(req))
    if (answer.ok) keys.add(makerAndName(answer.resolution.vendor, answer.resolution.model.model).toLowerCase())
  }
  return [...keys]
}

/**
 * A list being switched to *Only these* with nothing allowed starts with the models in use. Only the switch: a list
 * that is already *Only these*, or that names what it allows, is saved as sent.
 */
export function withModelsInUse(input: ListInput, currentMode: ListView['mode'], inUse: readonly string[]): ListInput {
  if (input.mode !== 'only_these' || currentMode === 'only_these') return input
  if (input.entries.some(e => e.effect === 'allow')) return input
  const allowed: ModelListEntry[] = inUse.map(pattern => ({ effect: 'allow', pattern }))
  return { mode: input.mode, entries: [...allowed, ...input.entries] }
}

/** What is allowed in the project, in a line: *Any model Fernhill allows* or *Only A, B*; with what is never allowed. */
export function allowedLine(view: ListView, reachable: readonly ReachableModel[], orgName: string): string {
  const label = (pattern: string) => reachable.find(m => m.key === pattern)?.label ?? pattern
  const allow = view.entries.filter(e => e.effect === 'allow').map(e => label(e.pattern))
  const never = view.entries.filter(e => e.effect === 'never').map(e => label(e.pattern))
  const base = view.mode === 'only_these'
    ? (allow.length === 0 ? 'No model is allowed yet' : `Only ${allow.join(', ')}`)
    : `Any model ${orgName} allows`
  return never.length === 0 ? base : `${base}, never ${never.join(', ')}`
}
