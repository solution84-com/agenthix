/**
 * The model policy (model access and policy spec, *Model selection*): one `ModelPolicy` row per boundary — the
 * organisation's, a project's, a person's own space — naming a model for talking, light work and heavy work, the
 * models that may be picked at all, and a ceiling. The effective policy takes each field from the nearest layer
 * that sets it — the boundary's, then the organisation's, then the agent's default model — and keeps each within
 * the allow-list and ceiling of every layer together, falling to the next layer's model, then the first allowed
 * model, where one is not. The organisation's allow-list and ceiling are a bound: a nearer layer only narrows them,
 * so no one can raise their own ceiling and spend the organisation's key above it.
 *
 * Runs do not read it yet: a run's model is still the agent's, narrowed by a boundary's model override, until the
 * worker's model moves to the policy.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { ResolveModelPolicy } from '../conversations/contract'
import {
  effectivePolicy, isEmptyPolicy, policyFromRow, validateModelPolicy, type ModelPolicyScope, type ModelPolicyValues,
} from './policyModels'

/** The organisation's policy carries this owner id; there is one organisation. */
export const ORG_POLICY_OWNER_ID = 'org'

export type PolicyOwner = { type: ModelPolicyScope; id: string }
export const ORG_POLICY_OWNER: PolicyOwner = { type: 'org', id: ORG_POLICY_OWNER_ID }

const key = (owner: PolicyOwner) => ({ ownerType_ownerId: { ownerType: owner.type, ownerId: owner.id } })

export async function readModelPolicy(owner: PolicyOwner): Promise<ModelPolicyValues | null> {
  const row = await prisma.modelPolicy.findUnique({ where: key(owner) })
  return row ? policyFromRow(row) : null
}

/**
 * Stores a boundary's policy after validating it — a person's or a project's within the organisation's allow-list
 * and ceiling; a policy that sets nothing is removed. Returns what is stored.
 */
export async function writeModelPolicy(owner: PolicyOwner, raw: unknown, updatedById: string): Promise<ModelPolicyValues | null> {
  const orgBound = owner.type === 'org' ? null : await readModelPolicy(ORG_POLICY_OWNER)
  const values = validateModelPolicy(raw, orgBound)
  if (isEmptyPolicy(values)) {
    await prisma.modelPolicy.deleteMany({ where: { ownerType: owner.type, ownerId: owner.id } })
    return null
  }
  const data = { ...values, allowed: values.allowed ?? Prisma.JsonNull, updatedById }
  await prisma.modelPolicy.upsert({
    where: key(owner),
    create: { ownerType: owner.type, ownerId: owner.id, ...data },
    update: data,
  })
  return values
}

export const resolveModelPolicy: ResolveModelPolicy = async (boundary, agent) => {
  const [own, org] = await Promise.all([readModelPolicy(boundary), readModelPolicy(ORG_POLICY_OWNER)])
  return effectivePolicy([own, org], agent)
}
