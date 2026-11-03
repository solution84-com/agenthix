/**
 * What a site tells hq of its live previews (core's `LIVE_PREVIEW_EVENTS`, `LIVE_PREVIEW_APP_EVENTS`,
 * `BUNDLE_EVENTS`). Each event counts only for a live preview hq opened on the site it came from, and is read field by
 * field; anything else is dropped. While the live preview's flag is off, every one is dropped unread (adr-0172). A site's own sentences are never shown: hq words what happened itself. Registered
 * with the site channel when this module loads, as branch work registers `branch.back`.
 */
import { prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import {
  BUNDLE_EVENTS, GUARD_STEPS, LIVE_PREVIEW_APP_EVENTS, LIVE_PREVIEW_APP_METHODS, LIVE_PREVIEW_EVENTS, parseGuardSignal,
  type GuardStep, type LivePreviewSummary,
} from '@agenthix/core'
import { onSiteEvent } from '../sites/channel/siteEventHandler'
import { appTickets, onAppsCutOff } from '../relays'
import { Logger } from '../server/utils/logger'
import { livePreviewById, moveFromSummary, moveLivePreview } from './store'
import { detailFor } from './opening'
import { afterStopped, releaseCopyAfterStop } from './stopping'
import { bundleLanded } from './bundles'
import { handleBranchMoved } from './back'
import { keepBlocked, keepServices } from './questions'
import { emitLivePreviewChange } from './socket'
import { keepAppState } from './appStore'
import { tellGuard, tellPerson, tellStoppedForResources } from './notices'
import { askSite } from './siteAsk'
import { guardFound } from './words'
import { whileLivePreviewOn } from './flag'

const logger = new Logger('LivePreviewEvents')

type SiteOf = { id: string; siteId: string; label: string; relayHostId: string | null }

async function siteBy(siteId: string): Promise<SiteOf | null> {
  return prisma.executionSite.findFirst({
    where: { siteId, status: { not: 'REVOKED' } }, select: { id: true, siteId: true, label: true, relayHostId: true },
  })
}

/** A live preview hq opened on the site this event came from; null for any other. */
export async function livePreviewFrom(siteId: string, livePreviewId: unknown): Promise<{ row: LivePreview; site: SiteOf } | null> {
  const [row, site] = await Promise.all([livePreviewById(livePreviewId), siteBy(siteId)])
  return row && site && row.executionSiteId === site.id ? { row, site } : null
}

function dropped(siteId: string, event: string): void {
  logger.warn(`site ${siteId}: dropped a ${event} event it may not send`)
}

export async function handleState(siteId: string, data: unknown): Promise<void> {
  const s = (data as { livePreview?: LivePreviewSummary } | null)?.livePreview
  const found = s ? await livePreviewFrom(siteId, s.livePreviewId) : null
  const row = found?.row
  if (!found || !row || !s || s.personId !== row.userId || s.workspaceId !== row.workspaceId || s.branch !== row.branch ||
      s.onMain !== row.onMain || typeof s.state?.state !== 'string') {
    dropped(siteId, LIVE_PREVIEW_EVENTS.state)
    return
  }
  const moved = await moveLivePreview(row.id, moveFromSummary(s, detailFor(found.site.label)))
  // A paused live preview's apps are cut off at the relays until it resumes, when the person enters again.
  if (moved?.state === 'PAUSED') appTickets.revoke({ livePreviews: [moved.id] })
  if (!moved || moved.state !== 'STOPPED') return
  await afterStopped(moved)
  await releaseCopyAfterStop(moved)
  if (s.state.state === 'stopped' && s.state.reason === 'resources') await tellStoppedForResources(moved, found.site.label, found.site.relayHostId)
}

const DONE: Partial<Record<GuardStep, string>> = {
  previewStopped: 'stopped a live preview',
  processKilled: 'stopped a process and paused a live preview',
  paused: 'paused a live preview',
  appStopped: 'stopped an app',
  asked: 'paused a live preview and asks whether to go on',
  refused: 'refused a request',
  alerted: 'found something unexpected',
}

/** What the guard did, most serious first. */
export function guardDone(steps: unknown): string {
  const known = Array.isArray(steps) ? (steps.filter(s => (GUARD_STEPS as readonly unknown[]).includes(s)) as GuardStep[]) : []
  const first = (Object.keys(DONE) as GuardStep[]).find(s => known.includes(s))
  return first ? DONE[first]! : 'found something unexpected'
}

export async function handleGuard(siteId: string, data: unknown): Promise<void> {
  const d = (data ?? {}) as { livePreviewId?: unknown; signal?: unknown; steps?: unknown }
  const site = await siteBy(siteId)
  const signal = parseGuardSignal(d.signal)
  if (!site || !signal) {
    dropped(siteId, LIVE_PREVIEW_EVENTS.guard)
    return
  }
  const found = d.livePreviewId == null ? null : await livePreviewFrom(siteId, d.livePreviewId)
  await tellGuard(found?.row ?? null, site.label, site.relayHostId, guardFound(signal), guardDone(d.steps))
}

/** The guard reported: hq keeps when it heard, by its own clock, never the site's. */
export async function handleGuardReport(siteId: string, _data: unknown, now = new Date()): Promise<void> {
  const site = await siteBy(siteId)
  if (!site) return
  await prisma.livePreviewGuardReport.upsert({
    where: { executionSiteId: site.id }, create: { executionSiteId: site.id, at: now }, update: { at: now },
  })
}

export async function handleServices(siteId: string, data: unknown): Promise<void> {
  const d = (data ?? {}) as { livePreviewId?: unknown; services?: unknown }
  const found = await livePreviewFrom(siteId, d.livePreviewId)
  if (!found) return dropped(siteId, LIVE_PREVIEW_APP_EVENTS.services)
  keepServices(found.row.id, d.services)
  emitLivePreviewChange(found.row, 'services')
}

export async function handlePackageBlocked(siteId: string, data: unknown): Promise<void> {
  const d = (data ?? {}) as { livePreviewId?: unknown; package?: { ecosystem?: unknown; name?: unknown; version?: unknown }; verdict?: unknown; facts?: unknown }
  const found = await livePreviewFrom(siteId, d.livePreviewId)
  const p = d.package
  const verdict = d.verdict && typeof d.verdict === 'object' ? d.verdict : null
  if (!found || !p || !verdict || typeof p.ecosystem !== 'string' || typeof p.name !== 'string' || typeof p.version !== 'string') {
    return dropped(siteId, LIVE_PREVIEW_APP_EVENTS.packageBlocked)
  }
  const facts = d.facts && typeof d.facts === 'object' ? (d.facts as Parameters<typeof keepBlocked>[2]) : null
  if (keepBlocked(found.row.id, { ecosystem: p.ecosystem, name: p.name, version: p.version }, facts, verdict as Parameters<typeof keepBlocked>[3])) {
    emitLivePreviewChange(found.row, 'question')
  }
}

export async function handleAppState(siteId: string, data: unknown): Promise<void> {
  const d = (data ?? {}) as { app?: Record<string, unknown>; run?: unknown }
  const found = await livePreviewFrom(siteId, d.app?.livePreviewId)
  if (!found || !(await keepAppState(found.row, d.app, d.run))) return dropped(siteId, LIVE_PREVIEW_APP_EVENTS.appState)
}

async function handleLanded(siteId: string, data: unknown): Promise<void> {
  if (!bundleLanded(siteId, data)) logger.warn(`site ${siteId}: a bundle.landed hq was not waiting for — dropped`)
}

/**
 * Apps the relays cut off for too many refused requests: each is stopped in its live preview, and the person who
 * started it told why.
 */
export async function handleAppsCutOff(appIds: string[]): Promise<void> {
  const apps = await prisma.liveApp.findMany({ where: { id: { in: appIds.slice(0, 50) } }, include: { livePreview: true } })
  for (const app of apps) {
    const row = app.livePreview
    if (!row || row.state === 'STOPPED') continue
    const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true } })
    if (site) {
      await askSite(site.siteId, LIVE_PREVIEW_APP_METHODS.stop, { livePreviewId: row.id, personId: row.userId, appId: app.id })
        .catch(err => logger.warn(`app ${app.id} not stopped after the relays cut it off: ${err instanceof Error ? err.message : String(err)}`))
    }
    await tellPerson(row, `The app ${app.name} was stopped`,
      `The relay refused many of the requests sent to it, so it was cut off and stopped. Ask the agent to look at what it serves, then start it again.`)
  }
}

onAppsCutOff(whileLivePreviewOn(handleAppsCutOff))
onSiteEvent(LIVE_PREVIEW_EVENTS.state, whileLivePreviewOn(handleState))
onSiteEvent(LIVE_PREVIEW_EVENTS.guard, whileLivePreviewOn(handleGuard))
onSiteEvent(LIVE_PREVIEW_EVENTS.guardReport, whileLivePreviewOn(handleGuardReport))
onSiteEvent(LIVE_PREVIEW_EVENTS.branchMoved, whileLivePreviewOn(handleBranchMoved))
onSiteEvent(LIVE_PREVIEW_APP_EVENTS.appState, whileLivePreviewOn(handleAppState))
onSiteEvent(LIVE_PREVIEW_APP_EVENTS.services, whileLivePreviewOn(handleServices))
onSiteEvent(LIVE_PREVIEW_APP_EVENTS.packageBlocked, whileLivePreviewOn(handlePackageBlocked))
onSiteEvent(BUNDLE_EVENTS.landed, whileLivePreviewOn(handleLanded))
