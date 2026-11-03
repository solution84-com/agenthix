/**
 * Which of a fleet admin's notifications in hq the Fleet Console shows as its notices, and as what (host-management
 * spec §4, §10). Only these kinds cross the console link; every other notification a person has stays in hq. Pure, so
 * the rule is tested on its own.
 */
import type { FleetNotice, FleetNoticeKind } from '@agenthix/core'
import { FLEET_MACHINE_NOTIFICATION_TYPES } from '../notifications/notificationKinds'
import {
  FLEET_LIVE_PREVIEW_STOPPED_FOR_RESOURCES, FLEET_SITE_MEMORY_HIGH, FLEET_SITE_MEMORY_RECOVERED,
} from '../livePreviews/noticeKinds'

/** An announced fleet admin action (`activity.ts`). */
export const FLEET_ACTIVITY_NOTIFICATION = 'fleet_activity'
export const FLEET_ADMIN_GRANTED = 'fleet_admin_granted'
export const FLEET_ADMIN_REMOVED = 'fleet_admin_removed'

const KIND_OF_TYPE: Record<string, FleetNoticeKind> = {
  [FLEET_MACHINE_NOTIFICATION_TYPES.left]: 'machineLeft',
  [FLEET_MACHINE_NOTIFICATION_TYPES.notHeardFrom]: 'machineNotHeardFrom',
  [FLEET_ACTIVITY_NOTIFICATION]: 'activity',
  [FLEET_ADMIN_GRANTED]: 'roleGranted',
  [FLEET_ADMIN_REMOVED]: 'roleRemoved',
  [FLEET_SITE_MEMORY_HIGH]: 'siteMemoryHigh',
  [FLEET_SITE_MEMORY_RECOVERED]: 'siteMemoryRecovered',
  [FLEET_LIVE_PREVIEW_STOPPED_FOR_RESOURCES]: 'livePreviewStoppedForResources',
}

export const FLEET_NOTICE_TYPES: readonly string[] = Object.keys(KIND_OF_TYPE)

type Row = { id: string; type: string; title: string; body: string; createdAt: Date; dismissible: boolean; subjectKey: string | null }

/** A notification as a fleet notice; null for one of any other kind. A machine's notice names the machine by its id. */
export function fleetNoticeOf(row: Row): FleetNotice | null {
  const kind = KIND_OF_TYPE[row.type]
  if (!kind) return null
  const machine = kind === 'machineLeft' || kind === 'machineNotHeardFrom' || kind === 'siteMemoryHigh' ||
    kind === 'siteMemoryRecovered' || kind === 'livePreviewStoppedForResources'
  return {
    id: row.id,
    kind,
    title: row.title,
    body: row.body,
    at: row.createdAt.toISOString(),
    dismissible: row.dismissible,
    hostId: machine ? row.subjectKey : null,
  }
}
