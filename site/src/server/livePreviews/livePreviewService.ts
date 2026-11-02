/**
 * The live preview's start on this site: the guard made and wired to the store, the containers, the host service's
 * figures and hq's line; and what a restart left behind put right. Nothing of a live preview is trusted from before
 * the restart: every container with a live preview's label is removed, and every live preview that was not stopped is
 * paused as having lost hq's line (it had: the site was down), its containers to be made again when the line is back.
 */
import { LIVE_PREVIEW_EVENTS, type GuardSignal } from '@agenthix/core'
import { hqConnectionManager } from '../hq/hqConnection'
import { hostFigures } from '../host/hostFigures'
import { Logger } from '../utils/logger'
import { listed, lpDocker } from './container/docker'
import { anyLivePreviewFilters } from './container/labels'
import { containerIds, containersExpected, currentTemplate, removeEverything, setOtherContainerCheck } from './container/container'
import { helperInPreview } from './container/exec'
import { LivePreviewGuard, type GuardDeps } from './guard/guard'
import { cliGuardDocker } from './guard/guardDocker'
import { killArgv } from './guard/processes'
import { siteExecGoing } from './livePreviewActivity'
import { pausePreview, resumePreview, stopPreview } from './livePreviewLife'
import { apps, installGuard } from './livePreviewRuntime'
import { seams } from './livePreviewSeams'
import { changeLivePreview, liveLivePreviews, livePreviewRow } from './livePreviewStore'
import { sweepBundles } from './bundles/bundleStore'
import { installPreviewServices } from './services'
import { setInstallRuntime } from './installs/installSeam'
import {
  acceptPackageUse, branchKey, COPY_PACKAGE_BLOCKED_EVENT, forgetPackages, PACKAGE_BLOCKED_EVENT, setCopyPackageBlockedTeller, setPackageBlockedTeller,
} from './installs/packages'
import { copyPlaceOf } from './livePreviewCopies'
import { runGoing, siteExecBegins } from './livePreviewActivity'
import { execInPreview } from './container/exec'

const logger = new Logger('livePreviews')

const LINE_LOST = 'This site lost its line to HQ, so the live preview paused. It resumes by itself once the line is back.'
const OUT_OF_MEMORY = 'The machine ran out of memory for this live preview, so it stopped to keep the machine running. Its branch and work are untouched.'

export function guardDeps(): GuardDeps {
  return {
    docker: cliGuardDocker,
    template: id => currentTemplate(id),
    helper: (id, argv, timeoutMs) => helperInPreview(id, argv, timeoutMs),
    activity: {
      spared: id => apps.spared(id),
      registeredPorts: id => apps.registeredPorts(id),
      siteExecGoing,
      busy: id => apps.list(id).some(a => a.state === 'starting'),
    },
    services: { differences: (id, c) => seams.services.differences(id, c), healthCheck: (id, n, c) => seams.services.healthCheck(id, n, c) },
    drops: async () => hostFigures.drops(),
    protectionsProblem: () => hostFigures.livePreviewProtectionsProblem(),
    now: Date.now,
    actions: {
      pause: (id, detail, signal: GuardSignal) => pausePreview(id, 'guard', detail, signal),
      stop: (id, detail, signal: GuardSignal) => stopPreview(id, 'guard', detail, signal),
      killContainers: async id => { await cliGuardDocker.kill(await containerIds(id)) },
      killProcesses: async (id, pids) => { await helperInPreview(id, killArgv(pids), 3_000) },
      stopApp: (id, appId) => apps.stopByGuard(id, appId),
      tell: event => hqConnectionManager.sendEvent(LIVE_PREVIEW_EVENTS.guard, event),
      now: Date.now,
    },
    watched: async id => {
      const row = await livePreviewRow(id)
      return row && row.state.state !== 'stopped' ? { id: row.id, projectId: row.projectId, paused: row.state.state === 'paused' } : null
    },
    isLive: async id => containersExpected(id) || (await livePreviewRow(id))?.state.state === 'starting',
    pauseForLineLoss: id => pausePreview(id, 'lineLost', LINE_LOST),
    resumeAfterLineLoss: async id => {
      const row = await livePreviewRow(id)
      if (row?.state.state === 'paused' && row.state.reason === 'lineLost') await resumePreview(row)
    },
    running: async () => (await liveLivePreviews()).filter(r => r.state.state === 'running').map(r => r.id),
    stopForMemory: id => stopPreview(id, 'resources', OUT_OF_MEMORY),
    hqLineUp: () => hqConnectionManager.connectionState() === 'connected',
    report: event => hqConnectionManager.sendEvent(LIVE_PREVIEW_EVENTS.guardReport, event),
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref(); return t },
    clearInterval: handle => clearInterval(handle as NodeJS.Timeout),
  }
}

/** Every container and network with a live preview's label, removed; the live previews left open, paused for the line. */
export async function recoverAfterRestart(guard: LivePreviewGuard): Promise<number> {
  for (const id of await listed(['ps', '-a', '-q', '--no-trunc', ...anyLivePreviewFilters()]).catch(() => [] as string[])) {
    await lpDocker(['rm', '-f', id]).catch(() => {})
  }
  const rows = await liveLivePreviews()
  for (const row of rows) {
    await removeEverything(row.id).catch(err => logger.warn(`Could not clear live preview ${row.id} after a restart: ${String(err)}`))
    if (row.state.state === 'starting') {
      await stopPreview(row.id, 'failed', 'The site restarted while this live preview was starting. Start it again.')
      continue
    }
    await changeLivePreview(row.id, cur => ({
      row: cur && cur.state.state !== 'stopped'
        ? {
          ...cur, containersRemoved: true,
          state: cur.state.state === 'paused' ? cur.state : { state: 'paused', since: new Date().toISOString(), reason: 'lineLost', signal: null, detail: LINE_LOST },
        }
        : null,
      result: null,
    }))
    const now = await livePreviewRow(row.id)
    if (now?.state.state === 'paused' && now.state.reason === 'lineLost') guard.markPausedForLine(row.id)
  }
  return rows.length
}

/** The install rule's seams: the tools reach the store and the container only through these. */
function installInstalls(): void {
  setPackageBlockedTeller(event => hqConnectionManager.sendEvent(PACKAGE_BLOCKED_EVENT, event))
  setCopyPackageBlockedTeller(event => hqConnectionManager.sendEvent(COPY_PACKAGE_BLOCKED_EVENT, event))
  seams.installs = { allow: (id, pkg, b) => acceptPackageUse(id, pkg, branchKey(b.workspaceId, b.branch)), forget: id => forgetPackages(id) }
  setInstallRuntime({
    previewById: async id => {
      const row = await livePreviewRow(id)
      if (!row) return null
      return {
        id: row.id, root: copyPlaceOf(row).containerDir, workspaceId: row.workspaceId, branch: row.branch,
        running: row.state.state === 'running', stopped: row.state.state === 'stopped',
      }
    },
    exec: async (lp, argv, opts) => {
      const done = siteExecBegins(lp.id)
      try {
        return await execInPreview(lp.id, lp.root, argv, opts)
      } finally {
        done()
      }
    },
    runGoing,
  })
}

let started = false

/** At the site's start, where it makes containers: the guard runs, and a restart's leftovers are put right. */
export async function startLivePreviews(): Promise<void> {
  if (started || process.env.AGENT_CONTAINER_ISOLATION !== 'true') return
  started = true
  installPreviewServices()
  installInstalls()
  setOtherContainerCheck((id, _containerId, inspect) => {
    const c = inspect as { Id?: string; Name?: string; State?: { Running?: boolean; Paused?: boolean; OOMKilled?: boolean } } | null
    if (!c?.Id) return null
    return seams.services.differences(id, { id: c.Id, name: (c.Name ?? '').replace(/^\//, ''), running: !!c.State?.Running, paused: !!c.State?.Paused, oomKilled: !!c.State?.OOMKilled, addresses: [], raw: inspect })
  })
  const guard = new LivePreviewGuard(guardDeps())
  installGuard(guard)
  const recovered = await recoverAfterRestart(guard).catch(err => {
    logger.error(`Could not put right what a restart left of live previews: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  })
  if (recovered) logger.info(`${recovered} live preview(s) were open when the site stopped; each resumes once HQ's line is back.`)
  guard.start()
  hqConnectionManager.onOpen(() => guard.reportNow())
  const timer = setInterval(() => { void sweepBundles().catch(() => 0) }, 10 * 60_000)
  timer.unref()
}

