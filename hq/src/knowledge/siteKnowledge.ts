/**
 * The knowledge methods on the site that holds an owner's pages (`location.*Knowledge`): a project's
 * on its own site, a person's on their storage site, the organisation's where it was placed. **Nothing here checks
 * who is asking** — the service has decided that before it calls. Every failure becomes one of a fixed set of reasons
 * (`SiteFailure`); the error itself, which can name a site's address or a path, only reaches the log.
 */
import {
  LOCATION_FILE_METHODS,
  LocationFileError,
  type KnowledgeOwnerRef,
  type LocationReadKnowledgeParams,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import { MAX_FILE_BYTES } from '@agenthix/core/file-tools'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { collectStream, translateFailure } from '../storage/locationFileStore'
import { resolveStorageSite } from '../storage/storageSite'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { Logger } from '../server/utils/logger'
import type { KnowledgeSites, SiteAnswer, SiteFailure } from './deps'
import { ensureOrgKnowledgePlacement } from '../storage/storageSite'

const logger = new Logger('Knowledge')

/** The longest a change or a listing waits for its site. */
const CHANGE_TIMEOUT_MS = 30_000

const wireOwner = (owner: KnowledgeOwnerRef): KnowledgeOwnerRef => ({ ownerType: owner.ownerType, ownerId: owner.ownerId })

function siteOf(owner: KnowledgeOwnerRef): Promise<string> {
  if (owner.ownerType === 'org') return ensureOrgKnowledgePlacement()
  return resolveStorageSite({ ownerType: owner.ownerType, ownerId: owner.ownerId })
}

function failureOf(err: unknown): SiteFailure {
  if (err instanceof SiteUnreachableError) return 'unreachable'
  if (err instanceof ChannelRequestFailed && err.code === 'unknown_method') return 'outdated'
  if (err instanceof LocationFileError) {
    if (err.code === 'not_found') return 'not_found'
    if (err.code === 'too_large') return 'too_large'
    if (err.code === 'outside' || err.code === 'invalid' || err.code === 'not_a_file' || err.code === 'not_a_directory') return 'invalid'
  }
  return 'failed'
}

async function settle<T>(method: string, owner: KnowledgeOwnerRef, work: () => Promise<T>): Promise<SiteAnswer<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (err) {
    const why = failureOf(err)
    // An unreachable site or a missing page is ordinary; anything else is worth a look. Never the params: a pattern.
    if (why === 'failed' || why === 'outdated') logger.warn('knowledge call failed', { method, ownerType: owner.ownerType, error: err })
    return { ok: false, why }
  }
}

type ControlMethod =
  | typeof LOCATION_FILE_METHODS.searchKnowledge
  | typeof LOCATION_FILE_METHODS.listKnowledge
  | typeof LOCATION_FILE_METHODS.writeKnowledge
  | typeof LOCATION_FILE_METHODS.editKnowledge
  | typeof LOCATION_FILE_METHODS.deleteKnowledge
  | typeof LOCATION_FILE_METHODS.restoreKnowledge
  | typeof LOCATION_FILE_METHODS.knowledgeVersions

function request<M extends ControlMethod>(owner: KnowledgeOwnerRef, method: M, params: SiteMethodParams<M>, timeoutMs = CHANGE_TIMEOUT_MS): Promise<SiteAnswer<SiteMethodResult<M>>> {
  return settle(method, owner, async () => {
    const siteId = await siteOf(owner)
    try {
      return await siteChannelRegistry.request(siteId, method, params, timeoutMs)
    } catch (err) {
      // An older site answers `unknown_method`, which `translateFailure` would pass on unclassified.
      if (err instanceof ChannelRequestFailed && err.code === 'unknown_method') throw err
      return translateFailure(siteId, method, err)
    }
  })
}

export const siteKnowledge: KnowledgeSites = {
  grep: (owner, grep, timeoutMs) =>
    request(owner, LOCATION_FILE_METHODS.searchKnowledge, { ...wireOwner(owner), grep }, timeoutMs)
      .then(a => (a.ok ? { ok: true as const, value: a.value.grep } : a)),
  list: (owner, timeoutMs) => request(owner, LOCATION_FILE_METHODS.listKnowledge, wireOwner(owner), timeoutMs),
  read: (owner, page, versionId) =>
    settle(LOCATION_FILE_METHODS.readKnowledge, owner, async () => {
      const params: LocationReadKnowledgeParams = { ...wireOwner(owner), relPath: page, maxBytes: MAX_FILE_BYTES, ...(versionId ? { versionId } : {}) }
      return new Uint8Array(await collectStream(await siteOf(owner), LOCATION_FILE_METHODS.readKnowledge, params, page))
    }),
  write: (owner, change) => request(owner, LOCATION_FILE_METHODS.writeKnowledge, { ...wireOwner(owner), ...change }),
  edit: (owner, change) => request(owner, LOCATION_FILE_METHODS.editKnowledge, { ...wireOwner(owner), ...change }),
  delete: (owner, change) => request(owner, LOCATION_FILE_METHODS.deleteKnowledge, {
    ...wireOwner(owner),
    page: change.page,
    ...(change.movedTo !== undefined ? { movedTo: change.movedTo } : {}),
    ...(change.permanently ? { permanently: true as const } : {}),
    ...(change.versionId !== undefined ? { versionId: change.versionId } : {}),
  }),
  restore: (owner, change) => request(owner, LOCATION_FILE_METHODS.restoreKnowledge, { ...wireOwner(owner), page: change.page, versionId: change.versionId }),
  versions: (owner, page) => request(owner, LOCATION_FILE_METHODS.knowledgeVersions, { ...wireOwner(owner), ...(page !== undefined ? { page } : {}) }),
}
