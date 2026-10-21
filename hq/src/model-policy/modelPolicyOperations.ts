/**
 * Reading and setting a model policy. A person's own is theirs alone; a project's is its admins' to set and every
 * member's to read, as its agent overrides are; the organisation's is its admins' to set and every person's to
 * read, since it is the default under their own. A personal project has no policy of its own: its person's
 * applies.
 */
import type { GetModelPolicy, SetModelPolicy } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { requireProjectAdmin, requireProjectMember } from '../projects/membership'
import { refuseOnPersonalProject } from '../projects/personalProject'
import { requireRole } from '../server/identity/requireRole'
import { ORG_POLICY_OWNER, readModelPolicy, writeModelPolicy, type PolicyOwner } from './modelPolicyService'
import { ModelPolicyValidationError, type ModelPolicyScope, type ModelPolicyValues } from './policyModels'

type ScopeArgs = { scope: ModelPolicyScope; projectId?: string }

export type ModelPolicyView = {
  /** This boundary's own policy; null where it sets nothing. */
  policy: ModelPolicyValues | null
  /** The organisation's, which applies wherever this one sets nothing; the same as `policy` for the organisation's own. */
  organisation: ModelPolicyValues | null
}

async function authorizeScope(args: ScopeArgs, userId: string, access: 'read' | 'write'): Promise<PolicyOwner> {
  const doing = access === 'write' ? 'Changing a model policy' : 'Viewing a model policy'
  if (args.scope === 'user') return { type: 'user', id: userId }
  if (args.scope === 'org') {
    if (access === 'write') await requireRole({ user: { id: userId } }, 'ADMIN', doing)
    return ORG_POLICY_OWNER
  }
  if (args.scope !== 'project' || typeof args.projectId !== 'string') throw new HttpError(400, 'Name a project')
  if (access === 'write') await requireProjectAdmin(args.projectId, userId, doing)
  else await requireProjectMember(args.projectId, userId, doing)
  await refuseOnPersonalProject(args.projectId, 'A model policy')
  return { type: 'project', id: args.projectId }
}

export const getModelPolicy: GetModelPolicy<ScopeArgs, ModelPolicyView> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const owner = await authorizeScope(args, context.user.id, 'read')
  const [policy, organisation] = await Promise.all([readModelPolicy(owner), readModelPolicy(ORG_POLICY_OWNER)])
  return { policy, organisation }
}

/** As sent: a missing or null field leaves it to the layer below; a policy that sets nothing is removed. */
type SetArgs = ScopeArgs & Partial<ModelPolicyValues>

export const setModelPolicy: SetModelPolicy<SetArgs, ModelPolicyValues | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const owner = await authorizeScope(args, context.user.id, 'write')
  const { talking, lightWork, heavyWork, allowed, ceiling } = args
  try {
    return await writeModelPolicy(owner, { talking, lightWork, heavyWork, allowed, ceiling }, context.user.id)
  } catch (err) {
    if (err instanceof ModelPolicyValidationError) throw new HttpError(400, err.message)
    throw err
  }
}
