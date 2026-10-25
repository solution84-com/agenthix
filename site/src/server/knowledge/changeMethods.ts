/**
 * The gate's channel methods (site protocol 1.7): `location.writeKnowledge`, `editKnowledge`, `deleteKnowledge`,
 * `restoreKnowledge` and `knowledgeVersions`, registered in `../hq/channelMethods.ts`. Params arrive as `unknown`
 * and are parsed through `parseParams`, as every owner-folder method's are; hq checks who may change what before it
 * asks (ADR-0042). Each change answers a `KnowledgeChangeResult` from `./gate.ts`. A name leading outside the owner's
 * pages, through a link, or a disk failure is a `LocationFileError` naming only hq's own ids and the page as given.
 */
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS,
  LocationFileError,
  type Exact,
  type KnowledgeChangeResult,
  type KnowledgeOwnerRef,
  type LocationDeleteKnowledgeParams,
  type LocationEditKnowledgeParams,
  type LocationFileErrorCode,
  type LocationKnowledgeVersionsParams,
  type LocationKnowledgeVersionsResult,
  type LocationRestoreKnowledgeParams,
  type LocationWriteKnowledgeParams,
} from '@agenthix/core'
import type { FileToolRefusal } from '@agenthix/core/file-tools'
import { parseParams } from '../storage/locationContainment'
import { Logger } from '../utils/logger'
import { KnowledgeFileRefusal } from './fileAccess'
import { deletePage, deletePermanently, editPage, restorePage, writePage } from './gate'
import { describeKnowledgeOwner, knowledgeOwnerShape, nameForRefusal, orgIdIsFixed } from './owner'
import { VERSION_ID, listDeleted, listVersions } from './versionStore'

const logger = new Logger('knowledge')

const page = z.string().min(1).max(4096)
const versionId = z.string().regex(VERSION_ID)

export const writeKnowledgeParams = z
  .object({ ...knowledgeOwnerShape, page, content: z.string(), baseVersion: z.string().min(1).nullable(), movedFrom: page.optional() })
  .refine(orgIdIsFixed)
export const editKnowledgeParams = z
  .object({ ...knowledgeOwnerShape, page, old_string: z.string().min(1), new_string: z.string(), replace_all: z.boolean().optional() })
  .refine(orgIdIsFixed)
/** `versionId` only with `permanently`; a move is never permanent. */
export const deleteKnowledgeParams = z
  .object({ ...knowledgeOwnerShape, page, movedTo: page.optional(), permanently: z.literal(true).optional(), versionId: versionId.optional() })
  .refine(orgIdIsFixed)
  .refine(p => (p.versionId === undefined || p.permanently) && !(p.permanently && p.movedTo !== undefined))
export const restoreKnowledgeParams = z.object({ ...knowledgeOwnerShape, page, versionId }).refine(orgIdIsFixed)
export const knowledgeVersionsParams = z.object({ ...knowledgeOwnerShape, page: page.optional() }).refine(orgIdIsFixed)

const _wireMirrorsCore: [
  Exact<z.infer<typeof writeKnowledgeParams>, LocationWriteKnowledgeParams>,
  Exact<z.infer<typeof editKnowledgeParams>, LocationEditKnowledgeParams>,
  Exact<z.infer<typeof deleteKnowledgeParams>, LocationDeleteKnowledgeParams>,
  Exact<z.infer<typeof restoreKnowledgeParams>, LocationRestoreKnowledgeParams>,
  Exact<z.infer<typeof knowledgeVersionsParams>, LocationKnowledgeVersionsParams>,
] = [true, true, true, true, true]
void _wireMirrorsCore

const CODE_FOR: Partial<Record<FileToolRefusal, LocationFileErrorCode>> = {
  'outside-root': 'outside',
  link: 'outside',
  'invalid-name': 'outside',
  'not-a-file': 'not_a_file',
  'not-found': 'not_found',
  'too-large': 'too_large',
}

/**
 * Runs one method's work, turning anything the store throws into a coded refusal that names only hq's ids and the
 * page as hq gave it. The detail goes to the log; a page's text never does.
 */
export async function guarded<T>(method: string, owner: KnowledgeOwnerRef, name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof LocationFileError) throw err
    const reason = err instanceof KnowledgeFileRefusal ? err.reason : 'failed'
    const code = CODE_FOR[reason] ?? 'failed'
    const detail = err instanceof KnowledgeFileRefusal ? err.detail : err instanceof Error ? err.message : String(err)
    logger.error(`${method} in ${describeKnowledgeOwner(owner)} refused (${reason})${detail ? `: ${detail}` : ''}`)
    throw new LocationFileError(code, `${method} "${nameForRefusal(name)}" in ${describeKnowledgeOwner(owner)}`)
  }
}

function ownerOf(p: KnowledgeOwnerRef): KnowledgeOwnerRef {
  return { ownerType: p.ownerType, ownerId: p.ownerId }
}

export async function writeKnowledge(params: unknown): Promise<KnowledgeChangeResult> {
  const method = LOCATION_FILE_METHODS.writeKnowledge
  const p = parseParams(writeKnowledgeParams, params, method)
  return guarded(method, p, p.page, () => writePage(ownerOf(p), p))
}

export async function editKnowledge(params: unknown): Promise<KnowledgeChangeResult> {
  const method = LOCATION_FILE_METHODS.editKnowledge
  const p = parseParams(editKnowledgeParams, params, method)
  return guarded(method, p, p.page, () => editPage(ownerOf(p), p))
}

export async function deleteKnowledge(params: unknown): Promise<KnowledgeChangeResult> {
  const method = LOCATION_FILE_METHODS.deleteKnowledge
  const p = parseParams(deleteKnowledgeParams, params, method)
  return guarded(method, p, p.page, () => p.permanently
    ? deletePermanently(ownerOf(p), { page: p.page, versionId: p.versionId })
    : deletePage(ownerOf(p), { page: p.page, movedTo: p.movedTo }))
}

export async function restoreKnowledge(params: unknown): Promise<KnowledgeChangeResult> {
  const method = LOCATION_FILE_METHODS.restoreKnowledge
  const p = parseParams(restoreKnowledgeParams, params, method)
  return guarded(method, p, p.page, () => restorePage(ownerOf(p), p))
}

/** A page's kept versions, newest first; with no page, Recently deleted. */
export async function knowledgeVersions(params: unknown): Promise<LocationKnowledgeVersionsResult> {
  const method = LOCATION_FILE_METHODS.knowledgeVersions
  const p = parseParams(knowledgeVersionsParams, params, method)
  return guarded(method, p, p.page ?? '.', () => (p.page === undefined ? listDeleted(ownerOf(p)) : listVersions(ownerOf(p), p.page)))
}
