import { describe, it, expect } from 'vitest'
import { agentRunView, lastLines, LEFT_A_SECRET, personRunView, type RunRowWithSteps } from '../runsView'

const at = new Date('2026-10-24T10:00:00.000Z')
const later = new Date('2026-10-24T10:00:05.000Z')
const output = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

function row(over: Partial<RunRowWithSteps> = {}): RunRowWithSteps {
  return {
    id: 'r1', workflowId: 'w1', versionId: 'v1', hash: 'h', placeType: 'project', placeId: 'p1', workspaceId: null,
    siteId: 's1', onBehalfOfUserId: 'u1', agentId: 'a1', agentRunId: 'ar1', parameters: {}, state: 'FAILED',
    failureCode: 'secret_in_files', failureMessage: 'KEY was found in config/prod.env', printedSecret: false,
    leaks: [{ path: 'config/prod.env', secretName: 'KEY' }], writeBack: null, startedAt: at, endedAt: later, createdAt: at,
    workflow: { name: 'deploy' }, version: { number: 3 },
    steps: [{ id: 's', runId: 'r1', index: 0, name: 'Build', state: 'FAILED', exitCode: 1, output, outputTruncated: false, startedAt: at, endedAt: later }],
    ...over,
  } as RunRowWithSteps
}

describe('what comes back from a run @SC-1297', () => {
  it('gives the agent the last 200 lines of each step', () => {
    const view = agentRunView(row())
    const lines = view.steps[0].output.split('\n')
    expect(lines[0]).toBe('line 51')
    expect(lines[199]).toBe('line 250')
    expect(lastLines('a\nb\n', 200)).toBe('a\nb\n')
  })

  it('tells the agent only that a secret was left in a file, never where or which', () => {
    const view = agentRunView(row())
    expect(view.failure).toBe(LEFT_A_SECRET)
    expect(JSON.stringify(view)).not.toMatch(/prod\.env|KEY/)
    expect(view).toMatchObject({ workflow: 'deploy', version: 3, state: 'failed', durationMs: 5000 })
  })

  it('shows the person all of the output and the file and secret found', () => {
    const view = personRunView(row())
    expect(view.steps[0].output).toBe(output)
    expect(view.leaks).toEqual([{ path: 'config/prod.env', secretName: 'KEY' }])
    expect(view.failure).toBe('KEY was found in config/prod.env')
  })
})
