import { describe, it, expect } from 'vitest'
import { heldTaskNotice, lostAccessRunNotice, NO_SITE_AVAILABLE_NOTICE } from '../taskHeldNotice'
import { HELD_FOR_RECONNECT_REASON, LOST_ACCESS_REASON, LOST_ACCESS_RUN_REFUSAL } from '../../../agents/taskExecutionReasons'
import { HELD_FOR_UPGRADE_DISPLAY } from '../../../agents/taskDisplayReason'

describe('heldTaskNotice', () => {
  it('tells a task held for a site that no site can take it now, and who can see why, without sending anyone to a page they cannot open', () => {
    expect(heldTaskNotice({ runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON })).toBe(NO_SITE_AVAILABLE_NOTICE)
    expect(NO_SITE_AVAILABLE_NOTICE).toBe('Waiting: no site is available. Your run starts as soon as a site can take it. Your fleet admins can see why in the Fleet Console.')
  })

  it('says the same of a task held until its site is upgraded, as a member can do nothing about either', () => {
    expect(heldTaskNotice({ runState: 'RUN_QUEUED', runStateReason: HELD_FOR_UPGRADE_DISPLAY })).toBe(NO_SITE_AVAILABLE_NOTICE)
  })

  it('says nothing about an ordinary queued task', () => {
    expect(heldTaskNotice({ runState: 'RUN_QUEUED', runStateReason: 'queued by user' })).toBeNull()
  })

  it('says nothing once the task is no longer queued', () => {
    expect(heldTaskNotice({ runState: 'RUN_ACTIVE', runStateReason: HELD_FOR_RECONNECT_REASON })).toBeNull()
  })

  it('says nothing without a reason', () => {
    expect(heldTaskNotice({ runState: 'RUN_QUEUED' })).toBeNull()
  })
})

describe('a scheduled or started task that waits for something real says so (spec §3)', () => {
  it('a task asked to start behind its agent\'s running task is not "held" — its wait note says where it is in line', async () => {
    const { WAITING_FOR_AGENT_REASON } = await import('../../../agents/taskExecutionReasons')
    expect(heldTaskNotice({ runState: 'RUN_QUEUED', runStateReason: WAITING_FOR_AGENT_REASON })).toBeNull()
  })

  it('a scheduled task queued because automation was off, or left idle with no agent', async () => {
    const { AUTOMATION_OFF_REASON, NO_AGENT_REASON } = await import('../../../agents/taskExecutionReasons')
    expect(heldTaskNotice({ runState: 'RUN_QUEUED', runStateReason: AUTOMATION_OFF_REASON })).toBe(AUTOMATION_OFF_REASON)
    expect(heldTaskNotice({ runState: 'RUN_NONE', runStateReason: NO_AGENT_REASON })).toBe(NO_AGENT_REASON)
    expect(heldTaskNotice({ runState: 'RUN_NONE', runStateReason: null })).toBeNull()
  })

  it('not a running task waiting for a place on its site: its wait note names the site at capacity', async () => {
    const { WAITING_FOR_SLOT_REASON } = await import('../../../agents/taskExecutionReasons')
    expect(heldTaskNotice({ runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON })).toBeNull()
  })
})

describe('lostAccessRunNotice', () => {
  it('says why Run is not offered on a task blocked because its person lost access', () => {
    expect(lostAccessRunNotice({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })).toBe(LOST_ACCESS_RUN_REFUSAL)
  })

  it('says nothing on any other block or state', () => {
    expect(lostAccessRunNotice({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })).toBeNull()
    expect(lostAccessRunNotice({ runState: 'RUN_FAILED', runStateReason: LOST_ACCESS_REASON })).toBeNull()
  })
})
