import { ModelAccessPanel } from './ModelAccessPanel'
import type { BlockProps } from './modelAccessParts'

export type { ModelAccessOwnerType } from './modelAccessParts'

/**
 * Model access at one boundary — the org, a person or a project (spec §6.3,
 * §6): what is set and one menu to add more. A Claude subscription is offered
 * to a person and a project; the organisation's is each person's own login,
 * under Settings › Your model logins. The status queries return presence and
 * whether the credential is currently usable; a secret is never sent back.
 */
export function ModelAccessSection({ ownerType, ownerId }: BlockProps) {
  const owner = { ownerType, ownerId }
  return <ModelAccessPanel keyOwner={owner} subscriptionOwner={ownerType === 'org' ? undefined : owner} />
}
