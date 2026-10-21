/**
 * gitGrantService
 * ===============
 * Which runs may obtain a git credential for a storage owner's repository, via
 * the GitHub App credential-helper callback.
 *
 * The boundary owns the attachment and the run acts as one boundary
 * (ADR-0060, ADR-0062), so the question is whether the run's own boundary is
 * the owner — never which projects the agent is assigned to, which grants it
 * nothing. A run that acts as nobody has no boundary and is refused: there is no
 * owner it could be asking on behalf of.
 */

import type { RepoTarget } from './repoAttachmentService'
import type { CallerContext } from '../server/controlplane/types'

export async function assertRunCanAccessOwner(ctx: CallerContext, target: RepoTarget): Promise<void> {
  // Only a run has a boundary to own a repository; a person's connection is not one.
  if (ctx.kind !== 'run') throw new Error('Only an agent run can obtain a git credential.')

  const { ownerType, ownerId } = target
  const { projectId, userId, role } = ctx.claims

  switch (ownerType) {
    case 'project':
      if (projectId && projectId === ownerId) return
      throw new Error("This run's boundary does not own this repository attachment.")

    case 'user':
      // A run acts as a person only in that person's own storage, which is the
      // one case that carries their role (capabilityService.ts). This branch
      // depends on that being the ONLY case a role is minted for — pinned by
      // capabilityService.test.ts's "whenever a mint returns a non-null role,
      // projectId is null and userId is the session's own user — checked
      // across a chat in the invoker's own storage, a chat in a project, a
      // task run".
      //
      // KNOWN WEAKNESS (R-106), and why `projectId` is checked too. `role` does
      // two jobs in the capability: how much org authority a run has (what the
      // control plane reads) and, here, "this run acts as this person". Only the
      // first is declared; the second is inferred from the first, and nothing in
      // the token's type says so. If a later change gave project chats a role —
      // reasonable for the first job — this gate would start handing a person's
      // private repository to every run in a project the whole project shares.
      // Requiring `projectId == null` makes the gate fail closed in that case
      // without changing the signed token, which every site verifies.
      //
      // The proper fix is an explicit claim in the capability naming what the run
      // acts as (`actsAs: { type, id }`) that this gate reads instead of `role`.
      // That is a change to a contract sites verify, so it needs a protocol
      // version and a coordinated site change; do it when the token next changes
      // for another reason, and delete this comment with it.
      if (role != null && projectId == null && userId === ownerId) return
      throw new Error("This run's boundary does not own this repository attachment.")

    default: {
      const _exhaustive: never = ownerType
      throw new Error(`Unknown owner type: ${_exhaustive}`)
    }
  }
}
