import { describe, expect, it } from 'vitest'
import { workflowsAddress, workflowsScreenOf } from '../useWorkflowsUrl'

const of = (q: string) => workflowsScreenOf(new URLSearchParams(q))

describe('the Workflows section in the address', () => {
  it('reads each screen', () => {
    expect(of('tool=workflows')).toEqual({ view: 'list' })
    expect(of('tool=workflows&workflow=w1')).toEqual({ view: 'workflow', workflowId: 'w1', tab: 'steps' })
    expect(of('workflow=w1&wtab=runs')).toEqual({ view: 'workflow', workflowId: 'w1', tab: 'runs' })
    expect(of('workflow=w1&version=3&against=1')).toEqual({ view: 'version', workflowId: 'w1', number: 3, against: 1 })
    expect(of('workflow=w1&run=r9')).toEqual({ view: 'run', workflowId: 'w1', runId: 'r9' })
  })
  it('ignores a version that is not a whole number', () => {
    expect(of('workflow=w1&version=x')).toEqual({ view: 'workflow', workflowId: 'w1', tab: 'steps' })
  })
  it('writes an address the reader gives back', () => {
    for (const screen of [
      { view: 'workflow' as const, workflowId: 'w1', tab: 'versions' as const },
      { view: 'version' as const, workflowId: 'w1', number: 2, against: null },
      { view: 'run' as const, workflowId: 'w1', runId: 'r1' },
    ]) {
      const [, q] = workflowsAddress('/projects/AGX', screen).split('?')
      expect(of(q)).toEqual(screen)
    }
  })
})
