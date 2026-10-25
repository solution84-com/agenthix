/**
 * The library's actions for people's screens: approve or decline one version by its hash, and switch a workflow on
 * or off. Each acts as the signed-in person; an agent never reaches these (its tools are forwarded by the site and
 * answered elsewhere).
 */
import type { ApproveWorkflowVersion, DeclineWorkflowVersion, SwitchWorkflow } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { approveWorkflowVersion as approve, declineWorkflowVersion as decline } from './approve'
import { setWorkflowEnabled } from './switch'

const HASH_RE = /^[0-9a-f]{64}$/

function requireDecideArgs(args: { workflowId?: unknown; hash?: unknown }): { workflowId: string; hash: string } {
  if (typeof args?.workflowId !== 'string' || typeof args?.hash !== 'string' || !HASH_RE.test(args.hash)) {
    throw new HttpError(400, 'A workflow id and the version\'s hash are required. Nothing was changed.')
  }
  return { workflowId: args.workflowId, hash: args.hash }
}

export const approveWorkflowVersion: ApproveWorkflowVersion<{ workflowId: string; hash: string; via?: 'review' | 'card' }, { number: number; enabled: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const via = args?.via === 'card' ? 'card' : 'review'
  return approve({ ...requireDecideArgs(args), via }, { kind: 'person', userId: context.user.id })
}

export const declineWorkflowVersion: DeclineWorkflowVersion<{ workflowId: string; hash: string }, { number: number }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return decline(requireDecideArgs(args), { kind: 'person', userId: context.user.id })
}

export const switchWorkflow: SwitchWorkflow<{ workflowId: string; enabled: boolean }, { enabled: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.workflowId !== 'string' || typeof args?.enabled !== 'boolean') {
    throw new HttpError(400, 'A workflow id and on or off are required. Nothing was changed.')
  }
  return setWorkflowEnabled(args.workflowId, args.enabled, { kind: 'person', userId: context.user.id })
}
