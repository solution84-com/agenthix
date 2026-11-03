/**
 * The live-preview methods' params as they came off the wire (livePreviews.ts), read closed, field by field: exactly
 * the fields the method takes, each its shape; null for anything else, an extra field included.
 */
import { parseLivePreviewRequest } from '../livePreview/livePreviewRequest.js'
import { parseLivePreviewIdleMinutes, parseLivePreviewLimit } from '../livePreview/livePreview.js'
import { isCommitId, isCopyId, isGitBranchName } from './gitNames.js'
import { WORKSPACE_OWNER_TYPES } from './siteData.js'
import type { WorkspaceRepoRef } from './branchWork.js'
import {
  LIVE_PREVIEW_STOPPERS,
  type LivePreviewActParams, type LivePreviewCopyRef, type LivePreviewOpenParams, type LivePreviewRefreshParams,
  type LivePreviewResumeParams, type LivePreviewStopParams, type LivePreviewStopper, type SiteLivePreviewsParams,
} from './livePreviews.js'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const id = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null)

function closed(v: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d = v as Record<string, unknown>
  return Object.keys(d).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(d, k)) ? d : null
}

function workspace(v: unknown): WorkspaceRepoRef | null {
  const d = closed(v, ['ownerType', 'ownerId', 'workspaceId'])
  const ownerId = id(d?.ownerId), workspaceId = id(d?.workspaceId)
  if (!d || !ownerId || !workspaceId || !(WORKSPACE_OWNER_TYPES as readonly unknown[]).includes(d.ownerType)) return null
  return { ownerType: d.ownerType as WorkspaceRepoRef['ownerType'], ownerId, workspaceId }
}

function copy(v: unknown): LivePreviewCopyRef | null {
  const kind = v && typeof v === 'object' ? (v as Record<string, unknown>).kind : undefined
  if (kind === 'bundle') {
    const d = closed(v, ['kind', 'copyId', 'bundleId'])
    return d && isCopyId(d.copyId) && isCopyId(d.bundleId) ? { kind, copyId: d.copyId, bundleId: d.bundleId } : null
  }
  if (kind !== 'branch' && kind !== 'main') return null
  const d = closed(v, ['kind', 'copyId'])
  return d && isCopyId(d.copyId) ? { kind, copyId: d.copyId } : null
}

export function parseLivePreviewOpenParams(v: unknown): LivePreviewOpenParams | null {
  const d = closed(v, ['livePreviewId', 'projectId', 'personId', 'workspace', 'branch', 'onMain', 'copy'])
  if (!d) return null
  const livePreviewId = id(d.livePreviewId), personId = id(d.personId)
  const projectId = d.projectId === null ? null : id(d.projectId)
  const ws = workspace(d.workspace), c = copy(d.copy)
  if (!livePreviewId || !personId || (d.projectId !== null && !projectId) || !ws || !c) return null
  if (!isGitBranchName(d.branch) || typeof d.onMain !== 'boolean') return null
  // A branch's own copy is never `main`'s, and `main`'s live preview never binds a branch's copy.
  if ((c.kind === 'main') !== d.onMain && c.kind !== 'bundle') return null
  return { livePreviewId, projectId, personId, workspace: ws, branch: d.branch, onMain: d.onMain, copy: c }
}

export function parseLivePreviewResumeParams(v: unknown): LivePreviewResumeParams | null {
  const d = closed(v, ['livePreviewId', 'personId'])
  const livePreviewId = id(d?.livePreviewId), personId = id(d?.personId)
  return livePreviewId && personId ? { livePreviewId, personId } : null
}

export function parseLivePreviewStopParams(v: unknown): LivePreviewStopParams | null {
  const d = closed(v, ['livePreviewId', 'by'])
  const livePreviewId = id(d?.livePreviewId)
  return d && livePreviewId && (LIVE_PREVIEW_STOPPERS as readonly unknown[]).includes(d.by)
    ? { livePreviewId, by: d.by as LivePreviewStopper } : null
}

export function parseLivePreviewActParams(v: unknown): LivePreviewActParams | null {
  const d = closed(v, ['livePreviewId', 'personId', 'request'])
  const livePreviewId = id(d?.livePreviewId), personId = id(d?.personId)
  const request = parseLivePreviewRequest(d?.request)
  return livePreviewId && personId && request ? { livePreviewId, personId, request } : null
}

export function parseLivePreviewRefreshParams(v: unknown): LivePreviewRefreshParams | null {
  const d = closed(v, ['livePreviewId', 'head', 'bundleId'])
  const livePreviewId = id(d?.livePreviewId)
  if (!d || !livePreviewId || !isCommitId(d.head)) return null
  if (d.bundleId !== null && !isCopyId(d.bundleId)) return null
  return { livePreviewId, head: d.head, bundleId: d.bundleId as string | null }
}

export function parseSiteLivePreviewsParams(v: unknown): SiteLivePreviewsParams | null {
  const d = closed(v, ['allowed', 'limit', 'idleMinutes'])
  const limit = parseLivePreviewLimit(d?.limit)
  const idleMinutes = parseLivePreviewIdleMinutes(d?.idleMinutes)
  return d && typeof d.allowed === 'boolean' && limit !== undefined && idleMinutes !== undefined
    ? { allowed: d.allowed, limit, idleMinutes } : null
}
