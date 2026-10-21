/**
 * A run of a task the thread did not commission, as its card (the overview's task-thread rules, 6): only an end
 * is a card — not a start, a request for approval or a pause — and the card names the task and how it ended.
 */
import { describe, it, expect } from 'vitest'
import { runPausedReason } from '@agenthix/core'
import { endedStateOf, runCardBody } from '../runCards'
import { withBrief } from '../brief'

const frame = (over: Partial<Parameters<typeof endedStateOf>[0]>) => ({ status: 'COMPLETED', error: null, manifestPending: null, ...over }) as Parameters<typeof endedStateOf>[0]

describe("a run's end, as the thread's card @SC-977", () => {
  it('is an end only when the run ended', () => {
    expect(endedStateOf(frame({ status: 'COMPLETED' }))).toBe('COMPLETED')
    expect(endedStateOf(frame({ status: 'FAILED', error: 'boom' }))).toBe('FAILED')
    expect(endedStateOf(frame({ status: 'CANCELLED' }))).toBe('CANCELLED')
    expect(endedStateOf(frame({ status: 'RUNNING' }))).toBeNull()
  })

  it('is no end while the run waits for approval, or was paused to start again', () => {
    expect(endedStateOf(frame({ status: 'RUNNING', manifestPending: { summary: 'x' } as never }))).toBeNull()
    expect(endedStateOf(frame({ status: 'CANCELLED', error: runPausedReason('maintenance') }))).toBeNull()
  })

  it("names the task and carries the run's result and the task's state", () => {
    const body = runCardBody({
      taskKey: 'SHOP-214', title: 'Fix the resize step', taskId: 't1', state: 'COMPLETED',
      result: { summary: 'Resized correctly now', stated: true, runId: 'r1', taskState: 'Release' }, error: null,
    })
    expect(body).toMatchObject({
      title: 'SHOP-214 Fix the resize step', summary: 'Resized correctly now', outcome: 'completed',
      taskId: 't1', taskKey: 'SHOP-214', taskState: 'Release',
    })
  })

  it('says why a failed run failed', () => {
    const body = runCardBody({ taskKey: 'SHOP-1', title: 'T', taskId: 't1', state: 'FAILED', result: { summary: 'partial', stated: false, runId: 'r' }, error: null })
    expect(body).toMatchObject({ outcome: 'failed', summary: 'The run failed' })
  })
})

describe("the run's first message @SC-977", () => {
  it("carries the thread's brief after it", () => {
    expect(withBrief('Execute your assigned task.', 'Only the thumbnails')).toBe(
      "Execute your assigned task.\n\nWhat was asked for in the task's conversation:\n\nOnly the thumbnails",
    )
  })

  it('is unchanged with no brief', () => {
    expect(withBrief('Execute your assigned task.', null)).toBe('Execute your assigned task.')
  })
})
