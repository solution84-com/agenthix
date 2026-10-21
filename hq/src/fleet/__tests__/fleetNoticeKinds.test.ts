import { describe, expect, it } from 'vitest'
import { FLEET_MACHINE_NOTIFICATION_TYPES } from '../../notifications/notificationKinds'
import { FLEET_ACTIVITY_NOTIFICATION, FLEET_ADMIN_GRANTED, FLEET_NOTICE_TYPES, fleetNoticeOf } from '../fleetNoticeKinds'

const at = new Date('2026-10-15T09:24:00.000Z')
const row = (type: string, over: Record<string, unknown> = {}) => ({
  id: 'n1', type, title: 'A title', body: 'A body', createdAt: at, dismissible: true, subjectKey: 'h1', ...over,
})

describe('the notices a fleet admin sees in the Fleet Console @SC-922', () => {
  it('names a machine’s notice by the machine, and cannot be put away while it stands', () => {
    expect(fleetNoticeOf(row(FLEET_MACHINE_NOTIFICATION_TYPES.notHeardFrom, { dismissible: false }))).toEqual({
      id: 'n1', kind: 'machineNotHeardFrom', title: 'A title', body: 'A body', at: at.toISOString(), dismissible: false, hostId: 'h1',
    })
    expect(fleetNoticeOf(row(FLEET_MACHINE_NOTIFICATION_TYPES.left))?.kind).toBe('machineLeft')
  })

  it('gives an announced action and a role change no machine', () => {
    expect(fleetNoticeOf(row(FLEET_ACTIVITY_NOTIFICATION))).toMatchObject({ kind: 'activity', hostId: null })
    expect(fleetNoticeOf(row(FLEET_ADMIN_GRANTED, { subjectKey: null }))).toMatchObject({ kind: 'roleGranted', hostId: null })
  })

  it('leaves out every other notification a person has in hq', () => {
    for (const type of ['tool_approval', 'task_waiting', 'site_health', 'agents_bypassed', 'hq_address_move']) {
      expect(fleetNoticeOf(row(type))).toBeNull()
      expect(FLEET_NOTICE_TYPES).not.toContain(type)
    }
  })
})
