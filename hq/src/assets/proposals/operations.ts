/**
 * Proposals as Wasp operations (spec part 5 *Proposing*; board C3): the card's reads, the review (accept, edit then
 * accept, reject with a note), aiming a proposal elsewhere, and a level's open proposals. Each acts as the signed-in
 * person; the policy is checked by what it calls. Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { LocationFileError } from '@agenthix/core'
import { asHttp } from '../operations'
import { LifecycleError } from '../lifecycle/errors'
import { ContentTooLargeError } from '../content'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { ProposalRefused } from './checks'
import { acceptProposal, rejectProposal } from './review'
import { aimProposal, openProposals } from './queue'
import { viewDraftCard, viewProposal } from './view'

type Ctx = { user?: { id: string } | null }
type Args = Record<string, unknown>
const args = (a: unknown): Args => (a && typeof a === 'object' ? (a as Args) : {})

async function asPerson<T>(context: Ctx, work: (userId: string) => Promise<T>): Promise<T> {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  return asHttp(async () => {
    try {
      return await work(userId)
    } catch (err) {
      if (err instanceof ProposalRefused) throw new HttpError(err.status, err.message)
      if (err instanceof LifecycleError) throw new HttpError(err.status, err.message)
      if (err instanceof ContentTooLargeError) throw new HttpError(400, `${err.message} Nothing was changed.`)
      if (err instanceof SiteUnreachableError) throw new HttpError(503, `${err.message} Nothing was changed.`)
      if (err instanceof LocationFileError) throw new HttpError(400, `The site couldn't write the skill's files (${err.detail}). Nothing was changed.`)
      throw err
    }
  })
}

export const getSkillProposal = (a: unknown, c: Ctx) => asPerson(c, u => viewProposal(prisma, u, args(a).proposalId))
export const getSkillDraftCard = (a: unknown, c: Ctx) => asPerson(c, u => viewDraftCard(prisma, u, { kind: args(a).kind, id: args(a).id }))
export const listSkillProposals = (a: unknown, c: Ctx) => asPerson(c, u => openProposals(prisma, u, { level: args(a).level, projectId: args(a).projectId }))

export const acceptSkillProposal = (a: unknown, c: Ctx) => asPerson(c, u => acceptProposal(prisma, u, {
  proposalId: args(a).proposalId, digest: args(a).digest, files: args(a).files, note: args(a).note,
}))
export const rejectSkillProposal = (a: unknown, c: Ctx) => asPerson(c, u => rejectProposal(prisma, u, {
  proposalId: args(a).proposalId, digest: args(a).digest, note: args(a).note,
}))
export const aimSkillProposal = (a: unknown, c: Ctx) => asPerson(c, u => aimProposal(prisma, u, { proposalId: args(a).proposalId, aim: args(a).aim }))
