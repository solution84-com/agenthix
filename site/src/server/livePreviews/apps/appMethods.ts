/**
 * hq's app methods for a live preview on this site (core's `livePreviewApps.ts`): `livePreview.appStart`,
 * `livePreview.appStop`, `livePreview.appList`. hq carries the agent's `start_app`, `stop_app` and `list_apps` here
 * once it has found the run's branch and its live preview; the site checks again that the live preview is running
 * here and, for an agent's start, that the run is going on its branch here. Starting the live preview was the
 * permission for these: nothing asks.
 */
import type {
  AppSpec, AppStatus, LivePreviewAppListResult, LivePreviewAppStartResult, LivePreviewAppStopResult,
} from '@agenthix/core'
import { Logger } from '../../utils/logger'
import { runGoing } from '../livePreviewActivity'
import { copyPlaceOf } from '../livePreviewCopies'
import type { LivePreviewRow } from '../livePreviewRows'
import { apps } from '../livePreviewRuntime'
import { seams } from '../livePreviewSeams'
import { livePreviewRow } from '../livePreviewStore'
import { maskAppStatus } from '../secrets/previewMasks'
import { MALFORMED, STOPPED, UNKNOWN, isRefused, pausedRefusal, refuse, type Refused } from '../livePreviewWords'

const logger = new Logger('livePreviewApps')

const ID = /^[A-Za-z0-9_-]{1,64}$/
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const anId = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null)

function readSpec(v: unknown): AppSpec | null {
  const a = rec(v)
  if (!a || Object.keys(a).length !== 5 || typeof a.appId !== 'string' || typeof a.name !== 'string' || typeof a.folder !== 'string'
    || typeof a.command !== 'string' || typeof a.port !== 'number') return null
  return { appId: a.appId, name: a.name, folder: a.folder, command: a.command, port: a.port }
}

function readStartedBy(v: unknown): { agentId: string; runId: string } | null | undefined {
  if (v === null) return null
  const s = rec(v)
  const agentId = anId(s?.agentId), runId = anId(s?.runId)
  return s && Object.keys(s).length === 2 && agentId && runId ? { agentId, runId } : undefined
}

async function runningPreview(id: string | null): Promise<LivePreviewRow | Refused> {
  if (!id) return MALFORMED
  const row = await livePreviewRow(id)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return STOPPED
  if (row.state.state === 'paused') return pausedRefusal(row.state.reason)
  return row
}

/** An app's lines leave the site masked against the secrets a workflow handed its live preview. */
const masked = async <T extends object>(r: T): Promise<T> => ('app' in r ? { ...r, app: await maskAppStatus((r as { app: AppStatus }).app) } : r)

const previewOf = (row: LivePreviewRow) => {
  const place = copyPlaceOf(row)
  return { id: row.id, personId: row.personId, root: place.containerDir, hostDir: place.hostDir }
}

export async function livePreviewAppStart(params: unknown): Promise<LivePreviewAppStartResult> {
  const p = rec(params)
  if (!p || Object.keys(p).length !== 4) return MALFORMED
  const row = await runningPreview(anId(p.livePreviewId))
  if (isRefused(row)) return row
  const spec = readSpec(p.app)
  const startedBy = readStartedBy(p.startedBy)
  if (!spec || startedBy === undefined || !anId(p.personId)) return MALFORMED
  if (startedBy && !runGoing(row.workspaceId, row.branch, startedBy.runId)) {
    return refuse('noRun', 'The run that asked is not going on this live preview\'s branch here, so no app was started. Nothing was changed.')
  }
  try {
    return { ok: true, result: await masked(await apps.start(previewOf(row), spec, startedBy)) }
  } catch (err) {
    logger.error(`An app of live preview ${row.id} could not start: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: true, result: { refused: 'badSpec', detail: 'The live preview\'s container is not running on this site, so the app did not start. Try again in a moment.' } }
  }
}

export async function livePreviewAppStop(params: unknown): Promise<LivePreviewAppStopResult> {
  const p = rec(params)
  if (!p || Object.keys(p).length !== 3 || !anId(p.personId)) return MALFORMED
  const row = await runningPreview(anId(p.livePreviewId))
  if (isRefused(row)) return row
  const appId = typeof p.appId === 'string' && p.appId.length <= 64 ? p.appId : null
  if (!appId) return MALFORMED
  return { ok: true, result: await masked(await apps.stop(row.id, appId)) }
}

export async function livePreviewAppList(params: unknown): Promise<LivePreviewAppListResult> {
  const p = rec(params)
  if (!p || Object.keys(p).length !== 1) return MALFORMED
  const id = anId(p.livePreviewId)
  if (!id) return MALFORMED
  const row = await livePreviewRow(id)
  if (!row) return UNKNOWN
  return { ok: true, apps: await Promise.all(apps.list(row.id).map(a => maskAppStatus(a))), services: seams.services.statuses(row.id) }
}
