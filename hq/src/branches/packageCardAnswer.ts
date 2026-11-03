/**
 * Answering a package card (`packageCard.ts`): *Allow* is approve, *Not now* is decline. Only a person who may work
 * here answers it — a Member or Admin of the project, or the person whose own storage it is — and *Allow* only by their
 * own press: a yes passed on by the conversation's agent from someone's words is refused, since that press is the only
 * proof a person read the risk. *Allow* tells the workspace's site (`branch.packageUse`), which checks that an agent
 * asked about exactly that package on the branch, and keeps the yes for the branch: it holds after the run that asked
 * ended and its copy was removed, and the next install in any copy of the branch runs its script.
 */
import { HttpError, prisma } from 'wasp/server'
import { BRANCH_PACKAGE_USE_METHOD } from '@agenthix/core'
import type { SettleOperation } from '../conversations/contract'
import { askSite, SiteFailed, SiteSilent } from '../livePreviews/siteAsk'
import { openBranchById, refOfBranch } from './branchRows'
import { locateWorkspace } from './workspaceLocation'
import { mayActIn } from './workspaceAccess'
import { parsePackageCardArgs, type PackageCardArgs } from './packageCardArgs'

const NOTHING = 'Nothing was changed.'

export const ALLOW_BY_PRESS = `A package's install script is allowed when a person presses Allow on its card, not through the agent. ${NOTHING}`

type Boundary = { boundaryType: 'user' | 'project' | null; boundaryId: string | null }

async function mayAllow(op: Boundary, userId: string): Promise<boolean> {
  if (!op.boundaryType || !op.boundaryId) return false
  return mayActIn({ ownerType: op.boundaryType, ownerId: op.boundaryId }, userId)
}

/** Why this person may not answer the card this way, or null when they may. */
export async function packageAnswerRefusal(op: Boundary, answer: 'approve' | 'decline', answererId: string, via: 'card' | 'turn'): Promise<string | null> {
  if (via === 'turn' && answer === 'approve') return ALLOW_BY_PRESS
  if (await mayAllow(op, answererId)) return null
  const who = op.boundaryType === 'user' ? 'the person whose space this is' : 'a Member or Admin of this project'
  return `Only ${who} can answer this; ask them. ${NOTHING}`
}

export type PackageCardDeps = {
  /** Waiting → running, once: false when someone answered first. */
  start(operationId: string): Promise<boolean>
  settle: SettleOperation
  /** Replaced in tests: the site's answer to `branch.packageUse`. */
  allow?: (logicalSiteId: string, params: Parameters<typeof askPackageUse>[1]) => Promise<boolean | 'noCopy' | 'noPackage'>
}

async function askPackageUse(logicalSiteId: string, params: {
  workspace: ReturnType<typeof refOfBranch>; copyId: string; branch: string; personId: string; name: string; version: string
}): Promise<boolean | 'noCopy' | 'noPackage'> {
  const answer = await askSite(logicalSiteId, BRANCH_PACKAGE_USE_METHOD, {
    workspace: params.workspace, copyId: params.copyId, branch: params.branch, personId: params.personId,
    package: { ecosystem: 'npm', name: params.name, version: params.version },
  })
  if (answer.ok) return true
  return answer.refusal.code === 'malformed' ? false : answer.refusal.code
}

export const allowedWords = (a: Pick<PackageCardArgs, 'name' | 'version' | 'branch'>) =>
  `${a.name} ${a.version} may run its install script on ${a.branch}. It runs the next time the agent installs packages there.`

function refusedWords(a: PackageCardArgs, why: false | 'noCopy' | 'noPackage'): string {
  if (why === 'noCopy') return `${a.branch}'s workspace is not on the site that asked any more, so ${a.name} was not allowed. ${NOTHING}`
  if (why === 'noPackage') return `${a.name} ${a.version} is no longer waiting there: the site restarted or it was answered already. If the agent still needs it, it asks again. ${NOTHING}`
  return `The site could not take the answer for ${a.name}. ${NOTHING}`
}

export async function answerPackageCard(
  row: { id: string; args: Record<string, unknown> | null },
  answer: 'approve' | 'decline',
  byUserId: string,
  deps: PackageCardDeps,
): Promise<void> {
  const args = parsePackageCardArgs(row.args)
  if (answer === 'decline') {
    const summary = args ? `Not now: ${args.name}'s install script stays off on ${args.branch}. ${NOTHING}` : `Not now. ${NOTHING}`
    if (!(await deps.settle(row.id, { state: 'CANCELLED', noReport: true, result: { summary } }))) {
      throw new HttpError(409, 'This request is no longer waiting for an answer.')
    }
    return
  }
  if (!args) throw new HttpError(409, `This request names no package. ${NOTHING}`)
  const op = await prisma.operation.findUnique({ where: { id: row.id }, select: { boundaryType: true, boundaryId: true } })
  if (!op || !(await mayAllow(op, byUserId))) throw new HttpError(403, `Only a Member or Admin of this project can allow it. ${NOTHING}`)
  if (!(await deps.start(row.id))) throw new HttpError(409, 'This request is no longer waiting for an answer.')

  const fail = async (status: number, message: string): Promise<never> => {
    await deps.settle(row.id, { state: 'FAILED', error: message })
    throw new HttpError(status, message)
  }
  const branch = await openBranchById(args.workspaceId, args.branchId)
  if (!branch) return fail(409, `${args.branch} is not open any more. ${NOTHING}`)
  const ws = await locateWorkspace(branch.workspaceId)
  if (!ws) return fail(409, `${args.branch}'s workspace is not on any site now. ${NOTHING}`)
  let result: boolean | 'noCopy' | 'noPackage'
  try {
    result = await (deps.allow ?? askPackageUse)(ws.logicalSiteId, {
      workspace: refOfBranch(branch), copyId: args.copyId, branch: branch.name, personId: byUserId, name: args.name, version: args.version,
    })
  } catch (err) {
    if (err instanceof SiteSilent) return fail(503, `${ws.name}'s site is not answering, so ${args.name} was not allowed. Answer again once it is back. ${NOTHING}`)
    if (err instanceof SiteFailed) return fail(502, `${ws.name}'s site could not take the answer; it may need upgrading. ${NOTHING}`)
    await deps.settle(row.id, { state: 'FAILED', error: `${args.name} could not be allowed. ${NOTHING}` })
    throw err
  }
  if (result !== true) return fail(409, refusedWords(args, result))
  await deps.settle(row.id, { state: 'COMPLETED', result: { summary: allowedWords(args) } })
}
