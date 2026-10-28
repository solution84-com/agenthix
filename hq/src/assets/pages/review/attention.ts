/**
 * The Overview's "skill proposals waiting" (board R1): one item for an administrator, read from every proposal the person reviews, at any level, so handling the last one clears it. It stands for no notification and has nothing to dismiss.
 */
import type { PrismaClient } from '@prisma/client'
import { libraryProposalPath } from '../../../library/components/libraryRoutes'
import { reviewScopes } from './queues'
import { agentName } from '../../proposals/names'

export const SKILL_PROPOSALS_ITEM_TYPE = 'skill_proposals'
const QUEUE_PATH = '/library/proposals'

export type SkillProposalsItem = {
  key: string
  area: 'workplace'
  type: typeof SKILL_PROPOSALS_ITEM_TYPE
  title: string
  body: string
  actionLabel: string
  actionUrl: string
  notificationIds: string[]
  dismissible: false
  acknowledgeable: false
  createdAt: Date
}

const quote = (name: string) => `"${name}"`

/** Null when nothing waits for this person to review, at the organisation, in a project they administer, or in their own space. */
export async function skillProposalsItem(db: PrismaClient, userId: string): Promise<SkillProposalsItem | null> {
  const scopes = await reviewScopes(db, userId)
  if (scopes.length === 0) return null
  const open = (await Promise.all(scopes.map(s => db.proposal.findMany({ where: { ...s.where, state: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 100 }))))
    .flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  if (open.length === 0) return null
  const named = await Promise.all(open.slice(0, 2).map(async p => `${p.assetId || p.placeSkillId ? 'an edit to' : ''} ${quote(p.name)}`.trim()))
  const from = [...new Set(await Promise.all(open.slice(0, 2).map(p => agentName(db, p.agentId))))].filter((n): n is string => !!n)
  const more = open.length > 2 ? ` and ${open.length - 2} more` : ''
  return {
    key: 'skill-proposals', area: 'workplace', type: SKILL_PROPOSALS_ITEM_TYPE,
    title: `${open.length} skill ${open.length === 1 ? 'proposal' : 'proposals'} waiting`,
    body: `${from.length ? `From ${from.join(' and ')}: ` : ''}${named.join(', and ')}${more}`,
    actionLabel: 'Review', actionUrl: open.length === 1 ? libraryProposalPath(open[0]!.id) : QUEUE_PATH,
    notificationIds: [], dismissible: false, acknowledgeable: false, createdAt: open[0]!.createdAt,
  }
}
