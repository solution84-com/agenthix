import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))
vi.mock('wasp/server', () => ({ prisma: { operation: { findFirst: h.findFirst } } }))
vi.mock('../../../conversations/coordinator/continuationChecks', () => ({ boundaryName: async () => 'Shop' }))
vi.mock('../../../conversations/work/settle', () => ({ outstandingOperations: async () => 2 }))
vi.mock('../../../conversations/sealing', () => ({ openText: (s: string) => s }))

import type { RunStatusEvent } from '@agenthix/core'
import type { ConversationEvents } from '../../../conversations/coordinator/events'
import {
  __resetForTests, __setEventsForTests, forwardRunFrame, handleOperationRunStatus, liveActivityOf, setRunWaitingLine,
} from '../operationLinesForward'

const sent = { lines: [] as unknown[], operations: [] as unknown[] }
const events = {
  operationLines: (e: unknown) => { sent.lines.push(e) },
  operation: (e: unknown) => { sent.operations.push(e) },
} as unknown as ConversationEvents

const call = (id: string, description: string, name = 'Task') =>
  forwardRunFrame('site1', { name: 'agentToolCall', runId: 'run1', data: { runId: 'run1', toolUseId: id, toolName: name, toolInput: { description } } })
const result = (id: string) =>
  forwardRunFrame('site1', { name: 'agentToolResult', runId: 'run1', data: { runId: 'run1', toolUseId: id, output: 'ok' } })

beforeEach(() => {
  __resetForTests()
  __setEventsForTests(events)
  sent.lines.length = 0
  sent.operations.length = 0
  h.findFirst.mockReset().mockResolvedValue({ id: 'op1', conversationId: 'c1', boundaryType: 'project', boundaryId: 'p1' })
})

describe('forwarding a run\'s work to its conversation @SC-972', () => {
  it('sends a helper as a path when a worker hands it work, and drops it with a count when it ends', async () => {
    await call('t1', 'Profile the image pipeline')
    expect(sent.lines.at(-1)).toEqual({ conversationId: 'c1', operationId: 'op1', lines: ['Shop · Profile the image pipeline'], endedHelpers: 0 })
    expect(liveActivityOf('op1').lines).toEqual(['Shop · Profile the image pipeline'])
    await result('t1')
    expect(sent.lines.at(-1)).toEqual({ conversationId: 'c1', operationId: 'op1', lines: [], endedHelpers: 1 })
  })

  it('keeps several helpers apart', async () => {
    await call('t1', 'One')
    await call('t2', 'Two')
    await result('t1')
    expect(liveActivityOf('op1')).toEqual({ lines: ['Shop · Two'], endedHelpers: 1 })
  })

  it('ignores a call that is not a helper', async () => {
    await call('t1', 'x', 'Read')
    expect(sent.lines).toEqual([])
    expect(h.findFirst).not.toHaveBeenCalled()
  })

  it('ignores a run that is no conversation\'s work, and does not ask again at once', async () => {
    h.findFirst.mockResolvedValue(null)
    await call('t1', 'One')
    await call('t2', 'Two')
    expect(sent.lines).toEqual([])
    expect(h.findFirst).toHaveBeenCalledTimes(1)
  })

  it('does not let another site add to, clear or end a run\'s lines', async () => {
    await call('t1', 'One')
    await forwardRunFrame('site2', { name: 'agentToolCall', runId: 'run1', data: { runId: 'run1', toolUseId: 't9', toolName: 'Task', toolInput: { description: 'Planted' } } })
    await forwardRunFrame('site2', { name: 'agentToolResult', runId: 'run1', data: { runId: 'run1', toolUseId: 't1', output: 'ok' } })
    await setRunWaitingLine('site2', 'run1', 'Waiting')
    await setRunWaitingLine('site2', 'run1', null)
    await handleOperationRunStatus({ runId: 'run1', status: 'COMPLETED' } as RunStatusEvent, 'site2')
    expect(liveActivityOf('op1')).toEqual({ lines: ['Shop · One'], endedHelpers: 0 })
    expect(sent.lines).toHaveLength(1)
  })

  it('forgets a run\'s lines when the run ends', async () => {
    await call('t1', 'One')
    await handleOperationRunStatus({ runId: 'run1', status: 'COMPLETED' } as RunStatusEvent, 'site1')
    expect(liveActivityOf('op1')).toEqual({ lines: [], endedHelpers: 0 })
  })
})

describe('a run starting @SC-972', () => {
  it('announces its work as running with the outstanding count', async () => {
    h.findFirst.mockResolvedValue({ id: 'op1', conversationId: 'c1', title: 'Profile it' })
    await handleOperationRunStatus({ runId: 'run1', status: 'RUNNING' } as RunStatusEvent, 'site1')
    expect(sent.operations).toEqual([{ conversationId: 'c1', operationId: 'op1', state: 'RUNNING', title: 'Profile it', outstanding: 2 }])
  })

  it('says nothing of a run that is no conversation\'s work', async () => {
    h.findFirst.mockResolvedValue(null)
    await handleOperationRunStatus({ runId: 'run1', status: 'RUNNING' } as RunStatusEvent, 'site1')
    expect(sent.operations).toEqual([])
  })
})

describe('a worker\'s run waiting before it starts', () => {
  it('shows why on its row, before its helpers, and drops it when it stops waiting', async () => {
    await setRunWaitingLine('site1', 'run1', 'Waiting for this project\'s other runs to finish before working on a branch')
    expect(sent.lines.at(-1)).toEqual({
      conversationId: 'c1', operationId: 'op1', lines: ['Waiting for this project\'s other runs to finish before working on a branch'], endedHelpers: 0,
    })
    await call('t1', 'One')
    expect(liveActivityOf('op1').lines).toEqual(['Waiting for this project\'s other runs to finish before working on a branch', 'Shop · One'])
    await setRunWaitingLine('site1', 'run1', null)
    expect(liveActivityOf('op1').lines).toEqual(['Shop · One'])
  })

  it('shows nothing for a run that is no conversation\'s work', async () => {
    h.findFirst.mockResolvedValue(null)
    await setRunWaitingLine('site1', 'run1', 'Waiting')
    expect(sent.lines).toEqual([])
  })
})
