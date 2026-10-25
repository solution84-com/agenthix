/**
 * What the knowledge service needs from outside itself: the sites holding pages (over the channel), hq's own copy of
 * the platform guide, who is an organisation admin, and the change record. The service takes them as one object, so
 * its rules are tested with each replaced; `index.ts` wires the real ones.
 */
import type {
  KnowledgeChangeKind,
  KnowledgeChangeResult,
  KnowledgeGrepParams,
  KnowledgeGrepResult,
  KnowledgeOwnerRef,
  LocationKnowledgeVersionsResult,
  LocationListKnowledgeResult,
} from '@agenthix/core'
import type { GrepFound, GrepParams } from '@agenthix/core/file-tools'
import type { PlatformGuideAnswer } from './platformGuide'
import type { KnowledgeReach } from './reach'

/**
 * Why a site could not answer, from a fixed set: never its error's text, which can name its disk or its address (S6).
 * `outdated` is a site that does not know the method yet.
 */
export type SiteFailure = 'unreachable' | 'outdated' | 'not_found' | 'too_large' | 'invalid' | 'failed'

export type SiteAnswer<T> = { ok: true; value: T } | { ok: false; why: SiteFailure }

/** A site-held owner's knowledge, on whichever site holds it. Nothing here checks who is asking. */
export interface KnowledgeSites {
  grep(owner: KnowledgeOwnerRef, params: KnowledgeGrepParams, timeoutMs: number): Promise<SiteAnswer<KnowledgeGrepResult>>
  list(owner: KnowledgeOwnerRef, timeoutMs: number): Promise<SiteAnswer<LocationListKnowledgeResult>>
  /** A page's bytes, or with `versionId` one of its kept versions'. */
  read(owner: KnowledgeOwnerRef, page: string, versionId?: string): Promise<SiteAnswer<Uint8Array>>
  write(owner: KnowledgeOwnerRef, change: { page: string; content: string; baseVersion: string | null; movedFrom?: string }): Promise<SiteAnswer<KnowledgeChangeResult>>
  edit(owner: KnowledgeOwnerRef, change: { page: string; old_string: string; new_string: string; replace_all?: boolean }): Promise<SiteAnswer<KnowledgeChangeResult>>
  delete(owner: KnowledgeOwnerRef, change: { page: string; movedTo?: string; permanently?: true; versionId?: string }): Promise<SiteAnswer<KnowledgeChangeResult>>
  restore(owner: KnowledgeOwnerRef, change: { page: string; versionId: string }): Promise<SiteAnswer<KnowledgeChangeResult>>
  /** A page's kept versions, newest first; with no page, the recently deleted pages. */
  versions(owner: KnowledgeOwnerRef, page?: string): Promise<SiteAnswer<LocationKnowledgeVersionsResult>>
}

export type GuideGrepAnswer =
  | { ok: true; found: GrepFound }
  | { ok: false; missing: boolean; message: string }

/** hq's own copy of the platform guide; every name in and out is the guide's (`your-tools/providers.md`). */
export interface KnowledgeGuide {
  grep(params: GrepParams, callerKey: string): Promise<GuideGrepAnswer>
  /** The guide's pages, for an empty pattern; null when this installation has no guide. */
  outline(): { name: string; title: string }[] | null
  read(args: { page: string; offset?: number; limit?: number }): PlatformGuideAnswer
}

/** One change the gate accepted, as hq records it (G5). */
export interface KnowledgeChangeEntry {
  owner: KnowledgeOwnerRef
  page: string
  /** For the moved page's record: where it was. */
  fromPage?: string
  kind: KnowledgeChangeKind
  version: string
  reach: Pick<KnowledgeReach, 'userId' | 'agent'>
}

export interface KnowledgeDeps {
  sites: KnowledgeSites
  guide: KnowledgeGuide
  isOrgAdmin(userId: string): Promise<boolean>
  recordChange(entry: KnowledgeChangeEntry): Promise<void>
  /** The one time limit a search across levels answers within. */
  searchTimeLimitMs: number
  log: { warn(message: string, fields?: Record<string, unknown>): void }
}
