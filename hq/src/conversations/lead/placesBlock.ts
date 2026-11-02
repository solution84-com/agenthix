/**
 * What the lead is told of its places every turn (agent knowledge spec, part 4, P6): the conversation's places by the
 * names the person sees, read from the same re-checked list the tools use (../places.ts), after the cached part of
 * the prompt. A place the person lost is no longer among them, so it is no longer named.
 */
import { prisma } from 'wasp/server'
import type { PlaceSummary } from '../placesProtocol'
import { locateWorkspace } from '../../branches/workspaceLocation'
import { placeWorkspaces } from '../../branches/leadWorkspaces'
import { addedPlaces, ownPlace, placeKey, placesConversation, samePlace, summaries, type Place } from '../places'

export interface PlacesForLead {
  /** The conversation's own place; null when its project is gone. */
  own: PlaceSummary | null
  /** Those the person added, oldest first. */
  added: PlaceSummary[]
  /** The workspace the conversation was started in (live preview spec, part 1); absent for any other. */
  workspace?: { name: string; git: boolean }
}

const named = (p: PlaceSummary) => `${p.name} (its pages are named ${p.level}:)`

export function placesTurnBlock({ own, added, workspace }: PlacesForLead): string {
  const lines = ["[This conversation's places, checked this turn]"]
  if (own) lines.push(`- ${named(own)}: the conversation's own`)
  for (const p of added) lines.push(`- ${named(p)}: added by the person`)
  if (!own && added.length === 0) lines.push('- none: its project is gone')
  if (workspace) {
    lines.push(workspace.git
      ? `This conversation was started in the workspace ${workspace.name}, a code workspace (Git). Work you start in its place works there, on this conversation's own branch, which a person merges into main. ` +
        'When the person asks to merge that work into main, start work in that place at once, with a brief saying the person asks to merge the branch into main: ' +
        'the work there shows them a confirmation with Merge. Never tell them you cannot merge, or to merge it themselves.'
      : `This conversation was started in the workspace ${workspace.name}. Work you start in its place works there.`)
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
  const workspace = await conversationWorkspace(conversationId)
  return {
    own: own ? summaryOf(own) : null,
    added: others.map(summaryOf).filter((s): s is PlaceSummary => s !== null),
    ...(workspace ? { workspace } : {}),
  }
}

/** The conversation's workspace, by name, and whether it has Git; null for a conversation started anywhere else. */
async function conversationWorkspace(conversationId: string): Promise<{ name: string; git: boolean } | null> {
  const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { workspaceId: true } })
  if (!row?.workspaceId) return null
  const ws = await locateWorkspace(row.workspaceId).catch(() => null)
  if (!ws) return null
  const found = (await placeWorkspaces(ws.ref.ownerType, ws.ref.ownerId)).find(w => w.id === ws.ref.workspaceId)
  return { name: ws.name, git: found?.git ?? false }
}
