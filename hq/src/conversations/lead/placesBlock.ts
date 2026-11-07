/**
 * What the lead is told of its places every turn (agent knowledge spec, part 4, P6): the conversation's places by the
 * names the person sees, read from the same re-checked list the tools use (../places.ts), after the cached part of
 * the prompt. A place the person lost is no longer among them, so it is no longer named.
 */
import { prisma } from 'wasp/server'
import type { PlaceSummary } from '../placesProtocol'
import { locateWorkspace } from '../../branches/workspaceLocation'
import { addedPlaces, ownPlace, placeKey, placesConversation, samePlace, summaries, type Place } from '../places'

export interface PlacesForLead {
  /** The conversation's own place; null when its project is gone. */
  own: PlaceSummary | null
  /** Those the person added, oldest first. */
  added: PlaceSummary[]
  /** The conversation's own open branches, one per code workspace its work changed; absent when none. */
  branches?: ConversationBranch[]
}

export interface ConversationBranch { branch: string; workspace: string; workspaceId: string }

const named = (p: PlaceSummary) => `${p.name} (its pages are named ${p.level}:)`

export function placesTurnBlock({ own, added, branches = [] }: PlacesForLead): string {
  const lines = ["[This conversation's places, checked this turn]"]
  if (own) lines.push(`- ${named(own)}: the conversation's own`)
  for (const p of added) lines.push(`- ${named(p)}: added by the person`)
  if (!own && added.length === 0) lines.push('- none: its project is gone')
  for (const b of branches) {
    lines.push(
      `This conversation's own branch ${b.branch} is in the code workspace ${b.workspace} (workspaceId ${b.workspaceId}): ` +
        'work you start with that workspace works on it, and a person merges it into main. When the person asks to merge ' +
        'it into main, start work there at once, with a brief saying the person asks to merge the branch into main: the ' +
        'work shows them a confirmation with Merge. Never tell them you cannot merge, or to merge it themselves.',
    )
  }
  lines.push(
    "The organisation's knowledge (org:) and the platform guide (platform:) are always in reach.",
    'Any other place, a project or the person\'s space, is out of reach until the person adds it: you cannot search',
    'it or start work there, so finding nothing in it does not mean it is empty. When the person names one or needs',
    'one, offer it with suggest_place; never answer as if it were empty, and never use one of these places instead.',
  )
  return lines.join('\n')
}

/** The places as the turn's tools reach them, by their names; null for a conversation that is gone. */
export async function placesForLead(conversationId: string): Promise<PlacesForLead | null> {
  const conversation = await placesConversation(conversationId)
  if (!conversation) return null
  const [own, added] = await Promise.all([ownPlace(conversation), addedPlaces(conversation)])
  const others: Place[] = added.map(a => a.place).filter(p => !own || !samePlace(p, own))
  const names = await summaries(own ? [own, ...others] : others)
  const summaryOf = (p: Place) => names.get(placeKey(p)) ?? null
  const branches = await conversationBranches(conversationId, own ? [own, ...others] : others)
  return {
    own: own ? summaryOf(own) : null,
    added: others.map(summaryOf).filter((s): s is PlaceSummary => s !== null),
    ...(branches.length > 0 ? { branches } : {}),
  }
}

/** The conversation's open branches in its places, with their workspaces' names; one whose workspace cannot be found is left out. */
async function conversationBranches(conversationId: string, places: readonly Place[]): Promise<ConversationBranch[]> {
  const rows = await prisma.workspaceBranch.findMany({
    where: { conversationId, state: 'OPEN' }, select: { name: true, workspaceId: true }, orderBy: { createdAt: 'asc' },
  })
  const found = await Promise.all(rows.map(async r => {
    const ws = await locateWorkspace(r.workspaceId).catch(() => null)
    const inPlace = ws && places.some(p => samePlace(p, { type: ws.ref.ownerType, id: ws.ref.ownerId }))
    return ws && inPlace ? { branch: r.name, workspace: ws.name, workspaceId: r.workspaceId } : null
  }))
  return found.filter((b): b is ConversationBranch => b !== null)
}
