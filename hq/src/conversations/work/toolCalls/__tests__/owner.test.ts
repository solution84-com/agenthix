/**
 * The owner of the lead's own calls (conversation layer spec, Approval; Stopping): approve runs the call once, as
 * it was asked, as the person who answered, detached, its end settled like any operation's; decline and Stop end
 * it cancelled with no report turn; an answer that comes second is refused. The rows are an in-memory stand-in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from 'wasp/server'
import type { OperationEnd } from '../../../contract'

vi.mock('../../../coordinator/mailbox', () => ({ settleOperation: vi.fn() }))
vi.mock('../runApproved', () => ({ runApprovedCall: vi.fn() }))

import { createToolCallOwner, NOT_WAITING, type ToolCallRow } from '../owner'
import type { ApprovedCall } from '../runApproved'

let row: ToolCallRow
let ends: OperationEnd[]
let runs: { call: ApprovedCall; by: string }[]
let detached: Promise<void>[]
let runResult: () => Promise<OperationEnd>
let owner: ReturnType<typeof createToolCallOwner>

beforeEach(() => {
  row = { id: 'op-1', kind: 'TOOL', state: 'WAITING_FOR_APPROVAL', conversationId: 'conv-1', turnId: 'turn-1', toolName: 'update_task', args: { taskId: 't1', title: 'New' } }
  ends = []
  runs = []
  detached = []
  runResult = async () => ({ state: 'COMPLETED', result: { summary: '{"success":true}' } })
  owner = createToolCallOwner({
    read: async id => (id === row.id ? row : null),
    async start() {
      if (row.state !== 'WAITING_FOR_APPROVAL') return false
      row.state = 'RUNNING'
      return true
    },
    async settle(_id, end) {
      if (!['WAITING_FOR_APPROVAL', 'RUNNING'].includes(row.state)) return false
      row.state = end.state
      ends.push(end)
      return true
    },
    async run(call, by) {
      runs.push({ call, by })
      return runResult()
    },
    detach: work => { detached.push(work) },
    logError: vi.fn(),
  })
})

describe('approve @SC-959', () => {
  it('runs the call once, as it was asked, as the person who answered, and settles its end', async () => {
    await owner.answerApproval('op-1', 'approve', null, 'answerer-1')
    expect(row.state).toBe('RUNNING')
    await Promise.all(detached)
    expect(runs).toEqual([{ call: { operationId: 'op-1', conversationId: 'conv-1', turnId: 'turn-1', toolName: 'update_task', args: { taskId: 't1', title: 'New' } }, by: 'answerer-1' }])
    expect(ends).toEqual([{ state: 'COMPLETED', result: { summary: '{"success":true}' } }])
  })

  it('a second answer is refused and runs nothing again', async () => {
    await owner.answerApproval('op-1', 'approve', null, 'answerer-1')
    await expect(owner.answerApproval('op-1', 'approve', null, 'answerer-2')).rejects.toThrow(NOT_WAITING)
    await Promise.all(detached)
    expect(runs).toHaveLength(1)
  })

  it('a call that fails unexpectedly ends failed, without the internal error', async () => {
    runResult = async () => { throw new Error('postgres://secret') }
    await owner.answerApproval('op-1', 'approve', null, 'answerer-1')
    await Promise.all(detached)
    expect(ends).toEqual([{ state: 'FAILED', error: 'update_task failed' }])
  })

  it('stopped while it runs, its late end is abandoned', async () => {
    let finish!: (end: OperationEnd) => void
    runResult = () => new Promise(resolve => { finish = resolve })
    await owner.answerApproval('op-1', 'approve', null, 'answerer-1')
    await owner.cancel('op-1', 'answerer-1')
    finish({ state: 'COMPLETED', result: { summary: 'late' } })
    await Promise.all(detached)
    expect(ends).toEqual([{ state: 'CANCELLED', noReport: true }])
  })
})

describe('decline @SC-959', () => {
  it('ends it cancelled with no report turn, with the note, and runs nothing', async () => {
    await owner.answerApproval('op-1', 'decline', 'Not today', 'answerer-1')
    expect(ends).toEqual([{ state: 'CANCELLED', noReport: true, result: { summary: 'Declined: Not today' } }])
    expect(runs).toHaveLength(0)
  })

  it('is refused for a request already answered', async () => {
    row.state = 'COMPLETED'
    await expect(owner.answerApproval('op-1', 'decline', null, 'answerer-1')).rejects.toBeInstanceOf(HttpError)
    expect(ends).toHaveLength(0)
  })
})

describe('Stop @SC-965', () => {
  it('ends a waiting call cancelled with no report turn', async () => {
    await owner.cancel('op-1', 'person-1')
    expect(ends).toEqual([{ state: 'CANCELLED', noReport: true }])
  })

  it('leaves an ended call as it is', async () => {
    row.state = 'COMPLETED'
    await owner.cancel('op-1', 'person-1')
    expect(ends).toHaveLength(0)
  })

  it('is refused for work that is not a call', async () => {
    row.kind = 'WORKER'
    await expect(owner.cancel('op-1', 'person-1')).rejects.toThrow(/not found/)
  })
})

describe('an agent\'s asset request (skills D31)', () => {
  it('is never run as the lead\'s own call: what it holds is checked as an asset request first', async () => {
    row.toolName = 'approve_asset_request'
    await expect(owner.answerApproval('op-1', 'approve', null, 'answerer-1')).rejects.toMatchObject({ statusCode: 409 })
    await Promise.all(detached)
    expect(runs).toHaveLength(0)
    expect(row.state).toBe('WAITING_FOR_APPROVAL')
  })
})
