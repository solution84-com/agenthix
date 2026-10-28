/**
 * Answering an agent's asset request (spec part 5, D31). Only the person the run acts for answers it, and Approve
 * only by their own tap: an approval passed on by the conversation's agent from their words is refused, as it is for
 * a workflow version. Approved, it runs only if that person holds the right at that level now, checked again here
 * whatever was checked when it was asked, and is recorded with them as who did it and the agent as who asked.
 * Declined, or the conversation closing, it ends and nothing is done.
 */
import { HttpError, prisma } from 'wasp/server'
import { AssetFileListError } from '@agenthix/core'
import type { SettleOperation } from '../../conversations/contract'
import { PackageReadError } from '../install/archive'
import { InstallRefusedError } from '../install/commit'
import { LifecycleError } from '../lifecycle/errors'
import { may, PolicyError, refusal } from '../policy'
import { organisationTarget, personActor } from '../policyActors'
import { NotOnShelfError } from '../sources/imageShelf'
import { assetRequestHandlers, type AssetRequestHandler, type AssetRequestHandlers } from './handlers'
import { ASSET_REQUEST_TOOL, parseRequestArgs, policyTarget } from './types'

const NOTHING = 'Nothing was changed.'

export const APPROVE_ASSET_BY_TAP =
  'An agent\'s request to change skills is approved by the person pressing Approve on its card, not through the agent. Nothing was changed.'

export function isAssetCard(toolName: string): boolean {
  return toolName === ASSET_REQUEST_TOOL
}

/** Why this person may not answer the card this way, or null when they may. */
export function assetAnswerRefusal(
  op: { authorisedById: string },
  answer: 'approve' | 'decline',
  answererId: string,
  via: 'card' | 'turn',
): string | null {
  if (answererId !== op.authorisedById) return `Only the person the agent asked can answer this. ${NOTHING}`
  if (via === 'turn' && answer === 'approve') return APPROVE_ASSET_BY_TAP
  return null
}

export type AssetCardDeps = {
  /** Waiting → running, once: false when someone answered first. */
  start(operationId: string): Promise<boolean>
  settle: SettleOperation
  handlers?: AssetRequestHandlers
}

/** A refusal's own words and status; null for a failure that isn't one. */
function refusalOf(err: unknown): { status: number; message: string } | null {
  if (err instanceof HttpError && err.statusCode < 500) return { status: err.statusCode, message: err.message }
  if (err instanceof PolicyError) return { status: 403, message: err.message }
  if (err instanceof InstallRefusedError || err instanceof LifecycleError) return { status: err.status, message: err.message }
  if (err instanceof NotOnShelfError) return { status: 404, message: err.message }
  if (err instanceof PackageReadError || err instanceof AssetFileListError) return { status: 400, message: err.message }
  return null
}

export async function answerAssetCard(
  row: { id: string; args: Record<string, unknown> | null },
  answer: 'approve' | 'decline',
  byUserId: string,
  deps: AssetCardDeps,
): Promise<void> {
  if (answer === 'decline') {
    await deps.settle(row.id, { state: 'CANCELLED', noReport: true, result: { summary: `Declined. ${NOTHING}` } })
    return
  }
  const args = parseRequestArgs(row.args)
  if (!args) throw new HttpError(409, `This request holds nothing HQ can do. ${NOTHING}`)
  if (byUserId !== args.requester.forUserId) throw new HttpError(403, `Only the person the agent asked can approve this. ${NOTHING}`)
  if (!(await deps.start(row.id))) throw new HttpError(409, 'This request is no longer waiting for an answer.')

  const fail = async (status: number, message: string): Promise<never> => {
    await deps.settle(row.id, { state: 'FAILED', error: message })
    throw new HttpError(status, message)
  }
  // The right is the person's at this moment, at the level the request was about.
  const actor = await personActor(byUserId, prisma, args.target.level === 'project' ? args.target.projectId : undefined)
  const target = policyTarget(args.target, (await organisationTarget(prisma)).outsideInstallers)
  if (!may(actor, args.action, target)) await fail(403, refusal(actor, args.action, target))

  const handlers = deps.handlers ?? assetRequestHandlers
  const handler = handlers[args.request.kind] as AssetRequestHandler
  try {
    const summary = await handler(args.request, { actor, requestedByAgentId: args.requester.agentId, runId: args.requester.runId })
    await deps.settle(row.id, { state: 'COMPLETED', result: { summary } })
  } catch (err) {
    const refused = refusalOf(err)
    if (refused) await fail(refused.status, refused.message)
    await deps.settle(row.id, { state: 'FAILED', error: 'This could not be done.' })
    throw err
  }
}
