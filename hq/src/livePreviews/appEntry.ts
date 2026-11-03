/**
 * Opening a live app (live preview spec section 4, *The app*): the relays' own entry (`relays/appEntry.ts`) with
 * hq's access check on the live preview. Anyone who may read the workspace sees its live previews, a Viewer included.
 */
import { liveAppEntryDeps, openLiveApp as openThroughRelay } from '../relays'
import { reachLivePreview } from './personActions'
import { touchLivePreview } from './store'
import type { LiveAppEntryForm, OpenLiveAppInput } from './types'

/** The live preview for the person, after the workspace's read rule; throws HQ's words when they may not see it. */
export async function livePreviewAccess(userId: string, livePreviewId: string) {
  const { row } = await reachLivePreview(userId, livePreviewId, 'read')
  return { id: row.id, state: row.state, workspaceId: row.workspaceId, executionSiteId: row.executionSiteId }
}

export async function openLiveApp(userId: string, a: OpenLiveAppInput): Promise<LiveAppEntryForm> {
  const form = await openThroughRelay(userId, a, liveAppEntryDeps(livePreviewAccess))
  await touchLivePreview(a.livePreviewId)
  return form
}
