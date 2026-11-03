/**
 * A live preview's services as the site runs them: `previewServices.ts` wired to Docker, the commit helper, the live
 * preview's own container and network, its budget and hq's line, and set as the live preview's services seam.
 */
import { LIVE_PREVIEW_APP_EVENTS } from '@agenthix/core'
import { hqConnectionManager } from '../../hq/hqConnection'
import { joinNetwork } from '../container/container'
import { servicesPool } from '../container/budget'
import { onLivePreviewChange, livePreviewRow } from '../livePreviewStore'
import { copyPlaceOf } from '../livePreviewCopies'
import { seams } from '../livePreviewSeams'
import { readPreviewServices } from './readServices'
import { cliServiceDocker } from './serviceDocker'
import { dbServiceApprovals } from './serviceApprovals'
import { runningDifferences } from './serviceInspect'
import { readServiceInspected } from './serviceInspected'
import * as services from './previewServices'

const deps: services.ServicesDeps = {
  docker: cliServiceDocker,
  read: lp => readPreviewServices(lp),
  joinPreview: (lp, network) => joinNetwork(lp.id, network),
  pool: lp => servicesPool(lp.id),
  tell: event => hqConnectionManager.sendEvent(LIVE_PREVIEW_APP_EVENTS.services, event),
  approvals: dbServiceApprovals,
  now: Date.now,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

let installed = false

/** Called once at the site's start, so the guard and the apps know the services before any live preview starts. */
export function installPreviewServices(): void {
  if (installed) return
  installed = true
  onLivePreviewChange(row => {
    if (row.state.state === 'stopped') services.forgetPreviewServices(row.id)
  })
  seams.services = {
    beforeStart: async lp => {
      const row = await livePreviewRow(lp.id)
      if (!row) return null
      const ensured = await services.ensurePreviewServices({ ...row, hostDir: lp.hostDir }, deps)
      return ensured.ok ? null : { refused: ensured.refused, detail: ensured.detail, problems: ensured.problems }
    },
    ports: id => services.previewServicePorts(id),
    statuses: id => services.previewServiceStatuses(id),
    problems: id => services.previewServiceProblems(id),
    approve: async (id, service, declaration) => {
      const row = await livePreviewRow(id)
      if (!row) return false
      return (await services.approveService({ ...row, hostDir: copyPlaceOf(row).hostDir }, service, declaration, deps)).ok
    },
    stopAll: async id => {
      const row = await livePreviewRow(id)
      if (row) await services.stopPreviewServices({ ...row, hostDir: copyPlaceOf(row).hostDir }, deps)
    },
    differences: (id, c) => {
      const t = services.serviceTemplateNamed(id, c.name)
      if (!t) return null
      const read = readServiceInspected(c.raw)
      return read ? runningDifferences(t, read) : ['inspect']
    },
    healthCheck: (id, name, command) => services.serviceTemplateNamed(id, name)?.healthCommand === command,
  }
}
