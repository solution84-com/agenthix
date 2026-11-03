/**
 * The `LivePreview` rows, read and written as the site's own record of a live preview. Only `livePreviewStore.ts`
 * calls these. Reading fails closed: a state this code did not write reads as stopped, and a copy kind it does not
 * know reads as stopped too, so nothing runs from a row the site cannot read.
 */
import { Prisma, type WorkspaceOwnerType } from '@prisma/client'
import { prisma } from '#db'
import {
  LIVE_PREVIEW_COPY_KINDS, LIVE_PREVIEW_PAUSE_REASONS, LIVE_PREVIEW_STOP_REASONS, parseGuardSignal,
  type LivePreviewCopyKind, type LivePreviewState, type LivePreviewSummary,
} from '@agenthix/core'

/**
 * Work left to finish, in the site's own shape:
 * - `stop`: a stop the site had begun, with who stopped it, finished at the next start;
 * - `back`: for a `bundle` copy, the head of the last bundle made from it for its way back (`bundle.make`), so a stop
 *   knows whether commits are still to come back.
 */
export type LivePreviewPending = { stop?: { by: string }; bundledHead?: string }

export type LivePreviewRow = {
  id: string
  projectId: string | null
  personId: string
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId: string
  branch: string
  onMain: boolean
  copyKind: LivePreviewCopyKind
  copyId: string
  baseCommit: string | null
  headCommit: string | null
  openedAt: string
  state: LivePreviewState
  runs: string[]
  pending: LivePreviewPending | null
  containersRemoved: boolean
}

/** The most runs kept per live preview: enough for any day's work, bounded so a row stays small. */
export const MAX_RUNS = 200

type Raw = Awaited<ReturnType<typeof prisma.livePreview.findUnique>> & object

const str = (v: unknown): v is string => typeof v === 'string'
const obj = (v: unknown): Record<string, unknown> | null =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)

function readState(raw: unknown, at: Date): LivePreviewState {
  const s = obj(raw)
  const since = s && str(s.since) ? s.since : at.toISOString()
  const detail = s && str(s.detail) ? s.detail : ''
  const signal = parseGuardSignal(s?.signal)
  if (s?.state === 'starting' || s?.state === 'running') return { state: s.state, since }
  const pause = LIVE_PREVIEW_PAUSE_REASONS.find(r => r === s?.reason)
  if (s?.state === 'paused' && pause) return { state: 'paused', since, reason: pause, signal, detail }
  const stop = LIVE_PREVIEW_STOP_REASONS.find(r => r === s?.reason) ?? 'failed'
  return { state: 'stopped', since, reason: stop, signal, detail: detail || 'This live preview stopped.' }
}

function readPending(raw: unknown): LivePreviewPending | null {
  const p = obj(raw)
  if (!p) return null
  const stop = obj(p.stop)
  const out: LivePreviewPending = {
    ...(stop && str(stop.by) ? { stop: { by: stop.by } } : {}),
    ...(str(p.bundledHead) ? { bundledHead: p.bundledHead } : {}),
  }
  return Object.keys(out).length ? out : null
}

function toRow(raw: Raw): LivePreviewRow {
  const kind = LIVE_PREVIEW_COPY_KINDS.find(k => k === raw.copyKind)
  const read = readState(raw.state, raw.openedAt)
  const state: LivePreviewState = kind || read.state === 'stopped' ? read
    : { state: 'stopped', since: read.since, reason: 'failed', signal: null, detail: 'This live preview stopped.' }
  return {
    id: raw.id, projectId: raw.projectId, personId: raw.personId, ownerType: raw.ownerType, ownerId: raw.ownerId,
    workspaceId: raw.workspaceId, branch: raw.branch, onMain: raw.onMain, copyKind: kind ?? 'branch', copyId: raw.copyId,
    baseCommit: raw.baseCommit, headCommit: raw.headCommit, openedAt: raw.openedAt.toISOString(), state,
    runs: Array.isArray(raw.runs) ? raw.runs.filter(str) : [], pending: readPending(raw.pending),
    containersRemoved: raw.containersRemoved,
  }
}

function toData(row: LivePreviewRow) {
  return {
    projectId: row.projectId, personId: row.personId, ownerType: row.ownerType, ownerId: row.ownerId,
    workspaceId: row.workspaceId, branch: row.branch, onMain: row.onMain, copyKind: row.copyKind, copyId: row.copyId,
    baseCommit: row.baseCommit, headCommit: row.headCommit, openedAt: new Date(row.openedAt),
    state: row.state as unknown as Prisma.InputJsonValue, runs: row.runs.slice(-MAX_RUNS),
    pending: row.pending ? row.pending as unknown as Prisma.InputJsonValue : Prisma.DbNull,
    containersRemoved: row.containersRemoved, live: row.state.state !== 'stopped',
  }
}

export async function readLivePreview(id: string): Promise<LivePreviewRow | null> {
  const raw = await prisma.livePreview.findUnique({ where: { id } })
  return raw ? toRow(raw) : null
}

export async function readLiveLivePreviews(): Promise<LivePreviewRow[]> {
  const rows = await prisma.livePreview.findMany({ where: { live: true } })
  return rows.map(toRow).filter(r => r.state.state !== 'stopped')
}

/** Stopped live previews whose copy may still be on this disk: a `bundle` copy waiting for its commits to go back. */
export async function readStoppedWithCopy(): Promise<LivePreviewRow[]> {
  const rows = await prisma.livePreview.findMany({ where: { live: false, copyKind: 'bundle', pending: { not: Prisma.DbNull } } })
  return rows.map(toRow)
}

export async function writeLivePreview(row: LivePreviewRow): Promise<void> {
  const data = toData(row)
  await prisma.livePreview.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data })
}

export function summaryOf(row: LivePreviewRow): LivePreviewSummary {
  return {
    livePreviewId: row.id, projectId: row.projectId, personId: row.personId, workspaceId: row.workspaceId,
    branch: row.branch, onMain: row.onMain, copy: { kind: row.copyKind, copyId: row.copyId }, head: row.headCommit,
    openedAt: row.openedAt, state: row.state,
  }
}
