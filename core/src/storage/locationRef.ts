/**
 * Which storage location an operation is about: an owner, and optionally one
 * place inside that owner's storage. The path is derived from this and never
 * stored (ADR-0039), and it is derived by the SITE, which is the only side that
 * has the disk — hq names the location and asks.
 *
 * `workspaceId` and `taskId` are mutually exclusive. Neither set means the
 * owner's own `files/` directory.
 *
 * This is the ONLY declaration of the shape. It began as a third one, beside a
 * copy in each app typed with that app's generated `WorkspaceOwnerType`, and
 * neither of those could be the wire's definition: core cannot import either
 * app's generated Prisma types, and the two apps never import from each other.
 * Both copies are gone now — hq's with the storage-layout module it lived in,
 * site's replaced by a re-export of this one from
 * `site/src/server/storage/paths.ts` — so the two apps and the wire cannot
 * disagree about the fields at all, and no drift test is needed to say so.
 *
 * What each app still pins, because it is the half a generated schema feeds, is
 * the owner VOCABULARY: `locationFileMethods.ts` and `repoWorkMethods.ts` on
 * site, `locationFileStore.ts` and `repoWorkStore.ts` on hq each assert at
 * compile time that their Prisma vocabulary and `StorageOwnerType` below agree
 * in BOTH directions. A one-directional check passes while core is missing an
 * owner kind the schema has, which is the direction that actually breaks.
 */
import type { WorkspaceOwnerType } from '../protocol/siteData.js'

/**
 * Who owns storage, as the wire names it.
 *
 * An ALIAS of `WorkspaceOwnerType` rather than a second `'project' | 'user'`
 * union written out again: `core/src/protocol/siteData.ts` already declares
 * itself the single source for this vocabulary, and both apps' zod validators
 * feed from its `WORKSPACE_OWNER_TYPES` array. A second independent union in
 * core is exactly the drift this file's own compile-time assertions exist to
 * prevent, and it would be the one copy nothing checks.
 *
 * The name is not decoration: these methods are about a storage LOCATION, which
 * is an owner plus optionally a workspace or a task — `WorkspaceOwnerType` reads
 * as if only a workspace were involved.
 */
export type StorageOwnerType = WorkspaceOwnerType

export interface LocationRef {
  ownerType: StorageOwnerType
  ownerId: string
  /** null/undefined → the owner's files/ dir; set → that workspace. Mutually exclusive with taskId. */
  workspaceId?: string | null
  /**
   * When set, this is a task-scoped location: …/tasks/{taskId}/.
   * Mutually exclusive with workspaceId. Only valid for project owners in practice.
   * Keyed by the immutable taskId (uuid) on both sides: the container binds the
   * tasks root, so it sees the host's own directory names (ADR-0057).
   */
  taskId?: string | null
}
