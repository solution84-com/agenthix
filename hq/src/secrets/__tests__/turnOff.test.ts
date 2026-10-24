/** *Turn off what uses it*: every switched-on workflow that names the value, through the library's switch, recorded. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const switched = vi.hoisted(() => ({ calls: [] as Array<{ ids: string[]; reason: string; by: string }> }))
vi.mock('../../workflows/switch', () => ({
  turnOffWorkflows: async (ids: string[], reason: string, by: string) => {
    switched.calls.push({ ids, reason, by })
    return { turnedOff: ids, stopped: ['run-9'] }
  },
}))
vi.mock('../access', async () => {
  const { refuse } = await import('../refusal')
  return {
    requireAdministerPlace: async (_p: unknown, userId: string, what: string) => {
      if (userId !== 'admin-1') refuse('not_allowed', `${what} is for this project's administrators: ask one of them.`)
    },
  }
})

import { useSecretsDb } from '../db'
import { SecretsRefusal } from '../refusal'
import { turnOffWhatUses } from '../turnOff'
import { FakeSecretsDb } from './fakeSecretsDb'

const P = { type: 'project' as const, id: 'p1' }
let db: FakeSecretsDb

const version = (id: string, name: string, enabled: boolean, secrets: string[]) => ({
  workflowId: id, workflowName: name, enabled, definition: { steps: [{ secrets }], variables: [] }, githubSecretNames: [],
})

beforeEach(() => {
  switched.calls.length = 0
  db = new FakeSecretsDb()
  useSecretsDb(db)
  db.approve(P, version('w1', 'deploy-staging', true, ['KEY']))
  db.approve(P, version('w2', 'restart-worker', true, ['KEY']))
  db.approve(P, version('w3', 'old-deploy', false, ['KEY']))
  db.approve(P, version('w4', 'lint', true, []))
})
afterEach(() => useSecretsDb(null))

describe('turnOffWhatUses', () => {
  it('switches off every switched-on workflow that names it, and records it', async () => {
    const r = await turnOffWhatUses(P, 'admin-1', 'secret', 'KEY')
    expect(switched.calls).toEqual([{ ids: ['w1', 'w2'], reason: 'the secret KEY was turned off', by: 'admin-1' }])
    expect(r.workflows.map(w => [w.name, w.enabled])).toEqual([['deploy-staging', false], ['restart-worker', false]])
    expect(r.runsStopped).toEqual(['run-9'])
    expect(r.next).toMatch(/Replace KEY/)
    expect(db.recordRows.map(x => [x.secretName, x.action, x.byUserId])).toEqual([['KEY', 'TURNED_OFF_USERS', 'admin-1']])
  })

  it('does nothing when nothing on uses it', async () => {
    const r = await turnOffWhatUses(P, 'admin-1', 'secret', 'UNUSED')
    expect(r.workflows).toEqual([])
    expect(switched.calls).toEqual([])
  })

  it('is for the place’s administrators only', async () => {
    await expect(turnOffWhatUses(P, 'member-1', 'secret', 'KEY')).rejects.toBeInstanceOf(SecretsRefusal)
    expect(switched.calls).toEqual([])
  })
})
