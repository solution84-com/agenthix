/**
 * Which turns may call a conversation's task tools (conversation layer spec, Tool execution contract): a turn that
 * answers a person, within its authority and the agent's tool permissions; never a report turn, and never a turn
 * that acts for no one. The three asks of create_task are read from `when`.
 */
import { describe, it, expect } from 'vitest'
import { HttpError } from 'wasp/server'
import { ControlPlaneError } from '../../../../server/controlplane/types'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'
import { refusedBy, taskToolRefusal } from '../gate'
import { readWhen } from '../when'

const permissions = (overrides: object) => ({ bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [], ...overrides })

describe('a task tool in a turn @SC-958', () => {
  it('may be called by a turn answering a person, with the tool at Always', () => {
    expect(taskToolRefusal(turnCapability(), 'run_task')).toBeNull()
  })

  it('is refused in a report turn, which starts no work', () => {
    expect(taskToolRefusal(turnCapability({ trigger: 'REPORT' }), 'run_task')).toMatch(/not available/)
  })

  it('is refused to a turn that acts for no one', () => {
    expect(taskToolRefusal(turnCapability({ actingUserId: null, readerUserId: 'u1' }), 'create_task')).toMatch(/acts for no one/)
  })

  it("is refused once the turn's authority has expired", () => {
    expect(taskToolRefusal(turnCapability({ expiresAt: 1 }), 'run_task')).toMatch(/expired/)
  })

  it('is refused when the agent may never use it', () => {
    expect(taskToolRefusal(turnCapability({ permissions: permissions({ bypassed: true, neverTools: ['run_task'] }) }), 'run_task'))
      .toMatch(/not available for this agent/)
  })

  it('is refused while it would need a person to approve it', () => {
    expect(taskToolRefusal(turnCapability({ permissions: permissions({}) }), 'create_task')).toMatch(/approval/)
  })

  it('is allowed at Always even when other tools ask', () => {
    const capability = turnCapability({ permissions: permissions({ allowedTools: [{ name: 'run_task', state: 'always' }] }) })
    expect(taskToolRefusal(capability, 'run_task')).toBeNull()
  })
})

describe('a refusal the lead can say @SC-958', () => {
  const logged: unknown[] = []
  const log = (_m: string, err: unknown) => { logged.push(err) }

  it("is a rule's own words", () => {
    expect(refusedBy('run_task', new ControlPlaneError('forbidden', 'Not yours'), log)).toEqual({ status: 'refused', reason: 'Not yours' })
    expect(refusedBy('run_task', new HttpError(403, 'Running this task requires membership of this project'), log))
      .toEqual({ status: 'refused', reason: 'Running this task requires membership of this project' })
    expect(logged).toEqual([])
  })

  it('never an internal error, which is logged instead', () => {
    const err = new Error('connection reset')
    expect(refusedBy('run_task', err, log)).toEqual({ status: 'refused', reason: 'run_task failed' })
    expect(logged).toEqual([err])
  })
})

describe('when the work happens @SC-969', () => {
  it('reads now, later, and a time', () => {
    expect(readWhen('now')).toEqual({ kind: 'now' })
    expect(readWhen(' Later ')).toEqual({ kind: 'later' })
    expect(readWhen('2026-10-20T09:00')).toEqual({ kind: 'at', at: '2026-10-20T09:00' })
  })
})
