/**
 * Workspace + RepoAttachment data channel — the contract between hq's store
 * (hq/src/storage/workspaceStore.ts) and site's handlers
 * (site/src/server/hq/channelMethods.ts, site/src/server/storage/workspaceRows.ts).
 * Plan 5c task 10 built the site side; task 11 builds hq's typed caller over
 * it. Both sides key their method registration/dispatch off `SITE_DATA_METHODS`
 * rather than the string literals directly, so a typo in either module fails
 * to compile instead of silently mismatching at the wire.
 *
 * Row types mirror site's Prisma models field-for-field, with one deliberate
 * difference: every `Date` crosses the wire as an ISO string (`JSON.stringify`'s
 * own Date coercion inside the channel's `send`, per workspaceRows.ts's own
 * header comment) — never a `Date` object, which does not survive the socket.
 */

/** Single source for the owner-type vocabulary — hq/site's zod validators
 *  (workspaceRows.ts's ownerTypeSchema, runtimeChannelMethods.ts) both feed
 *  from this array, so changing it here changes both without a second edit.
 *
 *  Two things own storage: a person and a project (ADR-0061). A product and a
 *  programme group projects and own nothing. */
export const WORKSPACE_OWNER_TYPES = ['project', 'user'] as const

export type WorkspaceOwnerType = (typeof WORKSPACE_OWNER_TYPES)[number]

export const SITE_DATA_METHODS = {
  workspaceGet: 'workspace.get',
  workspaceList: 'workspace.list',
  workspaceListByOwner: 'workspace.listByOwner',
  workspaceListByIds: 'workspace.listByIds',
  workspaceCreate: 'workspace.create',
  workspaceSetAllowedTools: 'workspace.setAllowedTools',
  workspaceDelete: 'workspace.delete',

  repoGetForTarget: 'repo.getForTarget',
  repoFindByUrl: 'repo.findByUrl',
  repoList: 'repo.list',
  repoCreate: 'repo.create',
  repoDelete: 'repo.delete',
} as const

export type SiteDataMethod = (typeof SITE_DATA_METHODS)[keyof typeof SITE_DATA_METHODS]

export type WorkspaceRow = {
  id: string
  name: string
  ownerType: WorkspaceOwnerType
  ownerId: string
  /** The owning site's own logical SiteConfig.siteId — self-referential by design (site's schema.prisma). */
  siteId: string
  /**
   * The workspace's tool cap: the tool names it allows, or null for no cap. The site writes no other shape
   * (workspaceRows.ts's `parseAllowedToolsShape` refuses anything else). It is still a stored JSON column, so the
   * §H6 intersection (`hq/src/server/identity/capabilityService.ts`) and the write-side guard
   * (`hq/src/storage/allowedToolsService.ts`) keep their own `Array.isArray` guards: a value of another shape read
   * as "no tool matches" would silently lock out every tool.
   */
  allowedTools: string[] | null
  createdAt: string
  updatedAt: string
}

/** `workspace.listByOwner`/`workspace.listByIds` with `select: 'caps'`. */
export type WorkspaceCapsRow = {
  id: string
  /** As `WorkspaceRow.allowedTools`. */
  allowedTools: string[] | null
}

/** `workspace.listByOwner` with `select: 'names'`. */
export type WorkspaceNameRow = {
  id: string
  name: string
}

export type WorkspaceListByOwnerSelect = 'caps' | 'names'

export type RepoAttachmentRow = {
  id: string
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId: string | null
  repoUrl: string
  createdAt: string
}

/** `repo.list`'s projection — no `id`/`createdAt`, matching workspaceRows.ts's `listRepoAttachments`. */
export type RepoAttachmentSummaryRow = {
  workspaceId: string | null
  ownerType: WorkspaceOwnerType
  ownerId: string
  repoUrl: string
}

/** `repo.getForTarget`'s params — a workspace target (workspaceId set) or an owner's-files target (workspaceId null/absent). */
export type RepoAttachmentTarget = {
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId?: string | null
}
