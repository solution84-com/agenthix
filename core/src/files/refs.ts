/**
 * How one file is named, wherever it is kept: the four spaces a ticket (`FileTicketClaims`) and "about this file"
 * (`file.about`) name a file in.
 *
 * - `place`: a file in a place's storage — an owner's `files/`, a workspace or a task (`LocationRef`) — by its path
 *   inside it. Since site protocol 1.18, a file of a workspace with Git may name a `commit` instead: the file as that
 *   commit's tree holds it, by its path in the repository (`isRepoPath`), read from the workspace's own repository.
 * - `artefact`: one item an agent made, by its file name directly in an owner's `artefacts/` (as
 *   `location.readArtefact` names it).
 * - `knowledge`: a knowledge page, by its path inside an owner's pages, or one of its kept versions (as
 *   `location.readKnowledge` names it). The organisation's own pages are an owner here.
 * - `upload`: a file hq keeps itself, by its upload path (`isUploadPath`).
 *
 * The first three are on a site, which confines each to its owner's storage; an upload is served by hq's relay from
 * hq's upload folder. A name here never carries an absolute path, and never steps up out of its folder.
 */
import { isCommitId, isRepoPath } from '../protocol/gitNames.js'
import { KNOWLEDGE_OWNER_TYPES, type KnowledgeOwnerRef } from '../protocol/locationKnowledge.js'
import type { StorageOwnerRef } from '../protocol/locationFiles.js'
import { WORKSPACE_OWNER_TYPES } from '../protocol/siteData.js'
import type { LocationRef } from '../storage/locationRef.js'
import { isUploadPath } from './uploadPaths.js'

export const FILE_SPACES = ['place', 'artefact', 'knowledge', 'upload'] as const
export type FileSpace = (typeof FILE_SPACES)[number]
/** The spaces a site serves. */
export const SITE_FILE_SPACES = ['place', 'artefact', 'knowledge'] as const
export type SiteFileSpace = (typeof SITE_FILE_SPACES)[number]

/** `commit`: a full commit id of the workspace's repository; absent, the file on disk. */
export type PlaceFileRef = { space: 'place'; loc: LocationRef; path: string; commit?: string }
export type ArtefactFileRef = { space: 'artefact'; owner: StorageOwnerRef; name: string }
export type KnowledgeFileRef = { space: 'knowledge'; owner: KnowledgeOwnerRef; path: string; versionId?: string }
export type UploadFileRef = { space: 'upload'; path: string }

export type SiteFileRef = PlaceFileRef | ArtefactFileRef | KnowledgeFileRef
export type FileRef = SiteFileRef | UploadFileRef

export const MAX_FILE_PATH_LENGTH = 4096

const isId = (v: unknown, max = 512): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0')
const optionalId = (v: unknown) => v === undefined || v === null || isId(v)
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A path relative to its folder: not absolute (no leading `/` or `\`, no drive letter) and never stepping up out of
 * it. The site still confines the real path.
 */
function isRelativePath(v: unknown): v is string {
  return isId(v, MAX_FILE_PATH_LENGTH) && !/^(?:[\\/]|[A-Za-z]:)/.test(v) && !v.split(/[\\/]/).includes('..')
}

function isFileName(v: unknown): v is string {
  return isId(v, 255) && !/[\\/]/.test(v) && v !== '.' && v !== '..'
}

export function isLocationRef(v: unknown): v is LocationRef {
  if (!record(v)) return false
  if (!(WORKSPACE_OWNER_TYPES as readonly unknown[]).includes(v.ownerType) || !isId(v.ownerId)) return false
  if (!optionalId(v.workspaceId) || !optionalId(v.taskId)) return false
  return !(v.workspaceId && v.taskId)
}

function readOwner<T extends string>(v: unknown, types: readonly T[]): { ownerType: T; ownerId: string } | null {
  if (!record(v) || !(types as readonly unknown[]).includes(v.ownerType) || !isId(v.ownerId)) return null
  return { ownerType: v.ownerType as T, ownerId: v.ownerId }
}

/**
 * The file a value names, with only the fields its space has, or null when it is not one. Used wherever a file's
 * name arrives from elsewhere: a ticket's claims, `file.about`'s params.
 */
export function readFileRef(v: unknown): FileRef | null {
  if (!record(v)) return null
  switch (v.space) {
    case 'place': {
      if (!isLocationRef(v.loc) || !isRelativePath(v.path)) return null
      if (v.commit === undefined || v.commit === null) return { space: 'place', loc: v.loc, path: v.path }
      // Only a workspace has a repository, and only one commit, never a branch or an expression, names a version of it.
      if (!isCommitId(v.commit) || !isRepoPath(v.path) || !v.loc.workspaceId || v.loc.taskId) return null
      return { space: 'place', loc: v.loc, path: v.path, commit: v.commit }
    }
    case 'artefact': {
      const owner = readOwner(v.owner, WORKSPACE_OWNER_TYPES)
      if (!owner || !isFileName(v.name)) return null
      return { space: 'artefact', owner, name: v.name }
    }
    case 'knowledge': {
      const owner = readOwner(v.owner, KNOWLEDGE_OWNER_TYPES)
      if (!owner || !isRelativePath(v.path)) return null
      if (v.versionId !== undefined && !isId(v.versionId)) return null
      return v.versionId === undefined
        ? { space: 'knowledge', owner, path: v.path }
        : { space: 'knowledge', owner, path: v.path, versionId: v.versionId as string }
    }
    case 'upload':
      return typeof v.path === 'string' && isUploadPath(v.path) ? { space: 'upload', path: v.path } : null
    default:
      return null
  }
}

export const isSiteFileRef = (ref: FileRef): ref is SiteFileRef => ref.space !== 'upload'

/** The name a person sees: the last part of its path. */
export function fileRefName(ref: FileRef): string {
  const path = ref.space === 'artefact' ? ref.name : ref.path
  return path.split('/').filter(Boolean).pop() ?? path
}
