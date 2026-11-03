/**
 * The site's one table of live-preview apps and its one guard, wired to the live preview's container, its services
 * and hq's line. The guard is installed when the site starts (`livePreviewService.ts`); until it is, no live preview
 * starts.
 */
import { LIVE_PREVIEW_APP_EVENTS } from '@agenthix/core'
import { hqConnectionManager } from '../hq/hqConnection'
import { AppTable, type AppDeps } from './apps/appTable'
import { helperInPreview, spawnInPreview } from './container/exec'
import type { LivePreviewGuard } from './guard/guard'
import { killArgv, readSnapshot, snapshotArgv } from './guard/processes'
import { SNAPSHOT_TIMEOUT_MS } from './guard/look'
import { seams } from './livePreviewSeams'
import { maskAppRun, maskAppStatus, previewMask } from './secrets/previewMasks'

let told: Promise<void> = Promise.resolve()

export const realAppDeps: AppDeps = {
  spawn: (id, root, argv, opts, onOutput) => spawnInPreview(id, root, argv, opts, onOutput),
  listening: async id => {
    const snapshot = readSnapshot((await helperInPreview(id, snapshotArgv(), SNAPSHOT_TIMEOUT_MS)).stdout)
    if (!snapshot) throw new Error('the look inside the live preview did not answer')
    return snapshot.listening
  },
  kill: async (id, pids) => { await helperInPreview(id, killArgv(pids), SNAPSHOT_TIMEOUT_MS) },
  // Masked against any secrets handed to the live preview, one event after another so they arrive in order.
  tell: event => {
    const mask = previewMask(event.app.livePreviewId)
    told = told.then(async () => {
      const masked = { ...event, app: await maskAppStatus(event.app, mask), run: await maskAppRun(event.run, mask) }
      hqConnectionManager.sendEvent(LIVE_PREVIEW_APP_EVENTS.appState, masked)
    }).catch(() => {})
  },
  beforeStart: (lp, spec) => seams.services.beforeStart(lp, spec),
  servicePorts: id => seams.services.ports(id),
  now: Date.now,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms).unref()),
}

export const apps = new AppTable(realAppDeps)

let guard: LivePreviewGuard | null = null

export function installGuard(next: LivePreviewGuard | null): void {
  guard = next
}

export function currentGuard(): LivePreviewGuard | null {
  return guard
}

export function guardHealthy(): boolean {
  return guard?.healthy ?? false
}
