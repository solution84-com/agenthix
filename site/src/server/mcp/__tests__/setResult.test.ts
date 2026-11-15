/**
 * set_result (workers and results spec, Results): the run states its result, and the site says which run that is.
 * The agent is never shown the run's id and cannot name another; with no run of the conversation going, nothing
 * is sent to hq. The MCP server is mocked to a recorder, as in mcpServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registrations = vi.hoisted(() => new Map<string, { schema: Record<string, unknown>; handler: (args: unknown) => Promise<unknown> }>())

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(function () { return ({
    tool: (...args: unknown[]) => {
      const name = args[0] as string
      const handler = args[args.length - 1] as (a: unknown) => Promise<unknown>
      const schema = args[args.length - 2] as Record<string, unknown>
      registrations.set(name, { schema, handler })
    },
  }) }),
}))

const { mockCallHqData } = vi.hoisted(() => ({ mockCallHqData: vi.fn() }))
vi.mock('../../hq/dataClient', () => ({ callHqData: mockCallHqData, HqDataError: class extends Error {} }))

import { createMcpServer } from '../mcpServer'

// Only `runId` and `sessionId` are read from a run's context here; the rest of it is the runtime's.
const runningContext = { runId: 'run-7', sessionId: 's1' } as never

beforeEach(() => {
  vi.clearAllMocks()
  registrations.clear()
})

describe('set_result @SC-1013', () => {
  it('is offered with only the result for the agent to give', () => {
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } })
    expect(Object.keys(registrations.get('set_result')!.schema)).toEqual(['result'])
  })

  it("sends hq the calling run's id, whatever the agent passed", async () => {
    mockCallHqData.mockResolvedValue({ success: true })
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } })
    await registrations.get('set_result')!.handler({ result: 'Released 1.2', runId: 'someone-elses' })
    expect(mockCallHqData).toHaveBeenCalledWith('set_result', { result: 'Released 1.2', runId: 'run-7' }, 'jwt-1')
  })

  it('sends nothing when no run of the conversation is going', async () => {
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: null, openCode: false } })
    const answer = await registrations.get('set_result')!.handler({ result: 'Released 1.2' }) as { isError?: boolean }
    expect(answer.isError).toBe(true)
    expect(mockCallHqData).not.toHaveBeenCalled()
  })
})

describe('what the forward tells hq, and the run, of a stated result and of a request', () => {
  it('marks the run as having stated its result once hq records it, and not when hq refuses it', async () => {
    const context = { runId: 'run-7', sessionId: 's1' } as { runId: string; sessionId: string; resultStated?: boolean }
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context as never, openCode: false } })
    mockCallHqData.mockRejectedValueOnce(new Error('refused'))
    await registrations.get('set_result')!.handler({ result: 'x' }).catch(() => {})
    expect(context.resultStated).toBeUndefined()
    mockCallHqData.mockResolvedValue({ success: true })
    await registrations.get('set_result')!.handler({ result: 'Released 1.2' })
    expect(context.resultStated).toBe(true)
  })

  it('tells hq when the run has asked for something that waits for approval, and only then', async () => {
    mockCallHqData.mockResolvedValue({ success: true })
    const context = { runId: 'run-7', sessionId: 's1', deferredManifest: { tools: [], bashPatterns: [] } }
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: context as never, openCode: false } })
    await registrations.get('update_task')!.handler({ taskId: 'WEB-3', state: 'DONE' })
    expect(mockCallHqData).toHaveBeenLastCalledWith('update_task', { taskId: 'WEB-3', state: 'DONE' }, 'jwt-1')
    context.deferredManifest.bashPatterns.push({ pattern: 'make' } as never)
    await registrations.get('update_task')!.handler({ taskId: 'WEB-3', state: 'DONE' })
    expect(mockCallHqData).toHaveBeenLastCalledWith('update_task', { taskId: 'WEB-3', state: 'DONE' }, 'jwt-1', { waitingForApproval: true })
  })
})
