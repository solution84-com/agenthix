/**
 * Who may touch a boundary's model credential (spec §6.3): the org's takes an
 * ADMIN, a project's takes that project's admin, and a person's is theirs alone.
 * Shared by the set/delete actions and the status query so the rule is one shape.
 */
import { HttpError } from 'wasp/server'
import { requireProjectAdmin } from '../projects/membership'
import { refuseOnPersonalProject } from '../projects/personalProject'
import { requireRole } from '../server/identity/requireRole'
import { isCredentialProvider, type CredentialProvider } from '../shared/modelProviders'

export type ModelCredentialOwnerType = 'org' | 'project' | 'user'
export type CredentialKind = 'API_KEY' | 'SUBSCRIPTION'

/** The org's credentials carry this owner id; there is one org. */
export const ORG_OWNER_ID = 'org'

export async function requireOwnerAccess(
  context: { user?: { id: string } | null },
  ownerType: ModelCredentialOwnerType,
  ownerId: string,
  what: string,
): Promise<void> {
  if (!context.user) throw new HttpError(401)
  if (ownerType === 'org') {
    if (ownerId !== ORG_OWNER_ID) throw new HttpError(400, `The organisation's credential has the owner id '${ORG_OWNER_ID}'`)
    await requireRole(context, 'ADMIN', what)
    return
  }
  if (ownerType === 'user') {
    if (ownerId !== context.user.id) throw new HttpError(403, 'You can only manage your own credentials')
    return
  }
  await requireProjectAdmin(ownerId, context.user.id, what)
  // A personal project's runs use its person's own credentials (spec §4), so a
  // credential stored against it would never be used — and must not be.
  await refuseOnPersonalProject(ownerId, 'A model credential')
}

/** A credential operation's provider: Anthropic when the caller names none. */
export function providerArg(value: unknown): CredentialProvider {
  if (value === undefined) return 'anthropic'
  if (!isCredentialProvider(value)) throw new HttpError(400, 'Unknown model provider')
  return value
}
