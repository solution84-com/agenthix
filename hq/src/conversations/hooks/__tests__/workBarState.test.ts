import { describe, expect, it } from 'vitest'
import type { OperationActivityView, OperationStateValue } from '../../../shared/conversations/protocol'
import { barHeading, workBar } from '../workBarState'

let n = 0
function row(state: OperationStateValue, over: Partial<OperationActivityView> = {}): OperationActivityView {
  const i = n++
  return {
    operationId: `o${i}`, kind: 'WORKER', title: `Review chapter ${i}`, state, word: 'working', boundaryName: 'Book',
    lines: [], endedHelpers: 0, canStop: true, createdAt: new Date(Date.UTC(2026, 9, 17, 10, i)).toISOString(), ...over,
  }
}

describe('what the work bar lists @SC-972', () => {
  it('holds work queued, working or waiting for the okay, and nothing ended or set for a time', () => {
    const rows = [
      row('QUEUED'), row('ACCEPTED'), row('RUNNING'), row('UNCERTAIN'), row('WAITING_FOR_APPROVAL'),
      row('SCHEDULED'), row('COMPLETED'), row('FAILED'), row('CANCELLED'), row('DETACHED'),
    ]
    const bar = workBar(rows)
    expect([...bar.requests, ...bar.others].map((r) => r.state).sort()).toEqual(['ACCEPTED', 'QUEUED', 'RUNNING', 'UNCERTAIN', 'WAITING_FOR_APPROVAL'])
  })

  it('puts the requests for the okay first, then the rest in the order they started', () => {
    const later = row('RUNNING')
    const ask = row('WAITING_FOR_APPROVAL', { request: { what: 'Run "wc"', reason: 'To count words', askedBy: 'Kernel' } })
    const earlier = row('RUNNING', { createdAt: '2026-10-17T09:00:00.000Z' })
    const bar = workBar([later, ask, earlier])
    expect(bar.requests.map((r) => r.operationId)).toEqual([ask.operationId])
    expect(bar.others.map((r) => r.operationId)).toEqual([earlier.operationId, later.operationId])
  })

  it('counts every live piece as working, and the requests as needing the person', () => {
    const bar = workBar([row('RUNNING'), row('QUEUED'), row('WAITING_FOR_APPROVAL'), row('WAITING_FOR_APPROVAL')])
    expect(bar.working).toBe(4)
    expect(bar.needYou).toBe(2)
    expect(barHeading(bar)).toBe('4 working · 2 need you')
  })

  it('says one needs you, and leaves the requests out when there are none', () => {
    expect(barHeading(workBar([row('RUNNING'), row('WAITING_FOR_APPROVAL')]))).toBe('2 working · 1 needs you')
    expect(barHeading(workBar([row('RUNNING'), row('RUNNING')]))).toBe('2 working')
  })

  it('is empty when nothing is live', () => {
    const bar = workBar([row('COMPLETED'), row('SCHEDULED')])
    expect(bar.working).toBe(0)
    expect(bar.requests).toEqual([])
    expect(bar.others).toEqual([])
  })
})
