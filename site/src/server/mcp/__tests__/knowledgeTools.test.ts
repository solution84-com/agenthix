/**
 * The knowledge tools on a run's MCP server (agent knowledge spec, part 3 *Serving*): forwarded to hq with the
 * calling run's id, which the agent is never shown and cannot name; answered with hq's text as it is, as the native
 * Grep and Read answer; and the change tools not registered at all for a run whose list leaves them out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registrations = vi.hoisted(() => new Map<string, { schema: Record<string, unknown>; handler: (args: unknown) => Promise<unknown> }>())

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(function () { return ({
    tool: (...args: unknown[]) => {
      const name = args[0] as string
      registrations.set(name, { schema: args[args.length - 2] as Record<string, unknown>, handler: args[args.length - 1] as (a: unknown) => Promise<unknown> })
    },
  }) }),
}))

const { mockCallHqData, FakeHqDataError } = vi.hoisted(() => {
  class FakeHqDataError extends Error {}
  return { mockCallHqData: vi.fn(), FakeHqDataError }
})
vi.mock('../../hq/dataClient', () => ({ callHqData: mockCallHqData, HqDataError: FakeHqDataError }))

import { createMcpServer, runForwardedTools } from '../mcpServer'
import { agentSchema } from '../toolSearchTools'
import { KNOWLEDGE_CHANGE_TOOLS } from '../forwardedKnowledgeSchemas'

const runningContext = { runId: 'run-7', sessionId: 's1' } as never
const NAMES = ['search_knowledge', 'read_knowledge', 'write_knowledge', 'edit_knowledge', 'delete_knowledge']

beforeEach(() => {
  vi.clearAllMocks()
  registrations.clear()
})

describe('the knowledge tools on a run\'s MCP server', () => {
  it('are all five, each shown without the run\'s id @SC-1394', () => {
    const opts = { capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } }
    createMcpServer(opts)
    const { shown, folded } = runForwardedTools(opts)
    for (const name of NAMES) {
      const tool = shown.get(name) ?? folded.get(name)
      expect(tool, name).toBeDefined()
      expect(Object.keys(agentSchema(tool!))).not.toContain('runId')
    }
    // Searching and reading are shown in full; changing knowledge is found by search.
    expect(registrations.has('search_knowledge') && registrations.has('read_knowledge')).toBe(true)
    expect(folded.has('write_knowledge')).toBe(true)
    expect(Object.keys(registrations.get('read_knowledge')!.schema)).toEqual(['page', 'offset', 'limit'])
  })

  it("forward to hq with the calling run's id, whatever the agent passed, and answer hq's text as it is @SC-1394", async () => {
    const text = 'website-rebuild:processes/release.md:14: Staging deploys go out after the checks pass.\n(1 match)'
    mockCallHqData.mockResolvedValue(text)
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } })
    const answer = await registrations.get('search_knowledge')!.handler({ pattern: 'staging', runId: 'someone-elses' })
    expect(mockCallHqData).toHaveBeenCalledWith('search_knowledge', { pattern: 'staging', runId: 'run-7' }, 'jwt-1')
    expect(answer).toEqual({ content: [{ type: 'text', text }] })
  })

  it('send nothing when no run of the conversation is going @SC-1394', async () => {
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: null, openCode: false } })
    const answer = await registrations.get('read_knowledge')!.handler({ page: 'org:a.md' }) as { isError?: boolean }
    expect(answer.isError).toBe(true)
    expect(mockCallHqData).not.toHaveBeenCalled()
  })

  it("say hq's refusal as a tool error @SC-1394", async () => {
    mockCallHqData.mockRejectedValue(new FakeHqDataError('write_knowledge is not available for this agent'))
    createMcpServer({ capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } })
    const answer = await registrations.get('use_tool')!.handler({ name: 'write_knowledge', input: { page: 'org:a.md', content: 'x' } }) as { isError?: boolean }
    expect(mockCallHqData).toHaveBeenCalledWith('write_knowledge', { page: 'org:a.md', content: 'x', runId: 'run-7' }, 'jwt-1')
    expect(answer.isError).toBe(true)
  })

  it('register no change tool for a run whose list leaves them out @SC-1395', () => {
    createMcpServer({ capabilityJwt: 'jwt-1', disabledTools: new Set(KNOWLEDGE_CHANGE_TOOLS), siteTools: { context: runningContext, openCode: false } })
    expect(registrations.has('search_knowledge')).toBe(true)
    expect(registrations.has('read_knowledge')).toBe(true)
    for (const name of KNOWLEDGE_CHANGE_TOOLS) expect(registrations.has(name)).toBe(false)
    const { folded } = runForwardedTools({ capabilityJwt: 'jwt-1', disabledTools: new Set(KNOWLEDGE_CHANGE_TOOLS), siteTools: { context: runningContext, openCode: false } })
    for (const name of KNOWLEDGE_CHANGE_TOOLS) expect(folded.has(name)).toBe(false)
  })
})
