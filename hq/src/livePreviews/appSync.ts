/**
 * hq's app rows following what a site reports (live preview spec section 4, *States*). Apps do not outlive the site's
 * containers: after a site restart its live previews come back with fresh containers and no app running. So whenever a
 * site is heard again, each of its live previews' apps is read from the site: an app hq holds as live there that the
 * site no longer runs reads as stopped, never as running, and one the site runs takes the state the site gives.
 */
import { prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_APP_METHODS } from '@agenthix/core'
import { askSite } from './siteAsk'
import { readAppSeen, type AppSeen } from './appStore'
import { emitLivePreviewChange } from './socket'

const GONE_STATES = ['starting', 'running', 'paused']

export const goneDetail = (site: string) => `It was no longer running on ${site}, which may have restarted. Start it again.`

/** Brings the live preview's app rows into step with the site's list. Throws when the site does not answer. */
export async function followSiteApps(siteId: string, siteName: string, row: Pick<LivePreview, 'id' | 'workspaceId' | 'branchId'>, now = new Date()): Promise<void> {
  const listed = await askSite(siteId, LIVE_PREVIEW_APP_METHODS.list, { livePreviewId: row.id })
  if (!listed.ok) return
  const told = new Map<string, AppSeen>()
  for (const a of Array.isArray(listed.apps) ? listed.apps.slice(0, 200) : []) {
    const seen = readAppSeen(a)
    if (seen && typeof a?.appId === 'string') told.set(a.appId, seen)
  }
  let changed = false
  for (const app of await prisma.liveApp.findMany({ where: { livePreviewId: row.id } })) {
    const seen = told.get(app.id)
    if (seen) {
      if (seen.state === app.state) continue
      await prisma.liveApp.update({ where: { id: app.id }, data: { state: seen.state, since: seen.since, detail: seen.detail, lastLines: seen.lastLines } })
      changed = true
    } else if (GONE_STATES.includes(app.state)) {
      await prisma.liveApp.update({ where: { id: app.id }, data: { state: 'stopped', since: now, detail: goneDetail(siteName) } })
      changed = true
    }
  }
  if (changed) emitLivePreviewChange(row, 'apps')
}
