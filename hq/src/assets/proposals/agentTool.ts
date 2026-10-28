/**
 * `propose_skill` as hq's data path answers it (`server/controlplane/operations.ts`): for the calling run only, its
 * refusals in words the agent reads as they are.
 */
import { HttpError, prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext, type ControlPlaneErrorCode } from '../../server/controlplane/types'
import { PolicyError } from '../policy'
import { LifecycleError } from '../lifecycle/errors'
import { ContentTooLargeError } from '../content'
import { ProposalRefused } from './checks'
import { proposingRun } from './caller'
import { proposeSkill } from './propose'
import type { ProposeSkillResult } from './types'

const CODE: Record<number, ControlPlaneErrorCode> = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'conflict' }

export async function proposeSkillOp(ctx: CallerContext, args: Record<string, unknown> & { runId?: string }): Promise<ProposeSkillResult> {
  const run = await proposingRun(ctx, args.runId)
  try {
    return await proposeSkill(prisma, run, args)
  } catch (err) {
    if (err instanceof ProposalRefused || err instanceof LifecycleError) throw new ControlPlaneError(CODE[err.status] ?? 'invalid', err.message)
    if (err instanceof PolicyError) throw new ControlPlaneError('forbidden', err.message)
    if (err instanceof ContentTooLargeError) throw new ControlPlaneError('invalid', `${err.message} Nothing was changed.`)
    if (err instanceof HttpError) throw new ControlPlaneError(CODE[err.statusCode] ?? 'invalid', err.message)
    throw err
  }
}
