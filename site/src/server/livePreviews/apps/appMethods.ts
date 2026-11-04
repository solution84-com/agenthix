/**
 * hq's app methods for a live preview on this site (core's `livePreviewApps.ts`): `livePreview.appStart`,
 * `livePreview.appStop`, `livePreview.appList`. hq carries the agent's `start_app`, `stop_app` and `list_apps` here
 * once it has found the run's branch and its live preview; the site checks again that the live preview is running
 * here and, for an agent's start, that the run is going on its branch here. Starting the live preview was the
 * permission for these: nothing asks.
 */
import {
  parseLivePreviewAppListParams, parseLivePreviewAppStartParams, parseLivePreviewAppStopParams,
  type AppStatus, type LivePreviewAppListResult, type LivePreviewAppStartResult, type LivePreviewAppStopResult,
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

async function runningPreview(id: string): Promise<LivePreviewRow | Refused> {
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
  const p = parseLivePreviewAppStartParams(params)
  if (!p) return MALFORMED
  const row = await runningPreview(p.livePreviewId)
  if (isRefused(row)) return row
  const { app: spec, startedBy } = p
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
  const p = parseLivePreviewAppStopParams(params)
  if (!p) return MALFORMED
  const row = await runningPreview(p.livePreviewId)
  if (isRefused(row)) return row
  return { ok: true, result: await masked(await apps.stop(row.id, p.appId)) }
}

export async function livePreviewAppList(params: unknown): Promise<LivePreviewAppListResult> {
  const p = parseLivePreviewAppListParams(params)
  if (!p) return MALFORMED
  const row = await livePreviewRow(p.livePreviewId)
  if (!row) return UNKNOWN
  return { ok: true, apps: await Promise.all(apps.list(row.id).map(a => maskAppStatus(a))), services: seams.services.statuses(row.id) }
}
