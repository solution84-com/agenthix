/**
 * The tool search on a run's MCP server (ADR-0193): the run is shown its must-haves, find_tools and use_tool; the
 * rest of what it is offered is named by area in the server's instructions, found through hq (among only the tools
 * the run is offered and not shown, answered in the site's own declarations) and called through use_tool, which
 * forwards as the native call does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  registrations: new Map<string, { schema: Record<string, unknown>; handler: (args: unknown) => Promise<unknown> }>(),
  instructions: [] as string[],
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(function (_info: unknown, options: { instructions: string }) {
    h.instructions.push(options.instructions)
    return ({
      tool: (...args: unknown[]) => {
        h.registrations.set(args[0] as string, { schema: args[args.length - 2] as Record<string, unknown>, handler: args[args.length - 1] as (a: unknown) => Promise<unknown> })
      },
    })
  }),
}))

const { mockCallHqData, FakeHqDataError } = vi.hoisted(() => {
  class FakeHqDataError extends Error {}
  return { mockCallHqData: vi.fn(), FakeHqDataError }
})
vi.mock('../../hq/dataClient', () => ({ callHqData: mockCallHqData, HqDataError: FakeHqDataError }))

import { createMcpServer, runForwardedTools } from '../mcpServer'

type Answer = { content: { text: string }[]; isError?: boolean }
const runningContext = { runId: 'run-7', sessionId: 's1' } as never
const opts = { capabilityJwt: 'jwt-1', siteTools: { context: runningContext, openCode: false } }
const call = (name: string, args: unknown) => h.registrations.get(name)!.handler(args) as Promise<Answer>
const json = (a: Answer) => JSON.parse(a.content[0]!.text) as { tools: { name: string; description: string; input: { properties: Record<string, unknown> } }[]; note?: string }

beforeEach(() => {
  vi.clearAllMocks()
  h.registrations.clear()
  h.instructions.length = 0
  createMcpServer(opts)
})

describe('what a run is shown @SC-2180', () => {
  it('its must-haves in full, and find_tools and use_tool; nothing else it is offered', () => {
    for (const name of ['set_result', 'add_comment', 'get_task_details', 'update_task', 'create_task', 'recall', 'remember', 'search_knowledge', 'read_knowledge', 'find_tools', 'use_tool', 'stop_processes']) {
      expect(h.registrations.has(name), name).toBe(true)
    }
    for (const name of ['create_routine', 'run_workflow', 'create_milestone', 'list_agents', 'run_task']) expect(h.registrations.has(name), name).toBe(false)
  })

  it('names each tool it finds by search under its area, beside the platform tools\' instructions', () => {
    expect(h.instructions[0]).toContain('task management tools are available')
    expect(h.instructions[0]).toContain('More tools, called with use_tool by name')
    expect(h.instructions[0]).toMatch(/- planning boards, sprints and milestones: [^\n]*create_milestone/)
    expect(h.instructions[0]).toMatch(/- workflows: [^\n]*run_workflow/)
    expect(h.instructions[0]).toContain("Before telling the person something can't be done, search for a tool with find_tools.")
  })
})

describe('find_tools @SC-2180', () => {
  it('asks hq among the tools the run is offered and not shown, and answers in the site\'s own declarations', async () => {
    mockCallHqData.mockResolvedValue({ tools: [
      { name: 'run_workflow', description: 'hq\'s copy', input: { properties: { runId: {} } } },
      { name: 'set_result', description: 'shown already', input: {} },
      { name: 'not_offered', description: 'x', input: {} },
    ] })
    const answer = json(await call('find_tools', { query: 'run the deploy workflow' }))
    const [name, args, jwt] = mockCallHqData.mock.calls[0]!
    expect([name, jwt]).toEqual(['find_tools', 'jwt-1'])
    expect(args.query).toBe('run the deploy workflow')
    expect(args.among).toEqual([...runForwardedTools(opts).folded.keys()])
    expect(args.among).not.toContain('set_result')
    expect(answer.tools.map(t => t.name)).toEqual(['run_workflow'])
    expect(answer.tools[0]!.description).not.toBe('hq\'s copy')
    expect(answer.tools[0]!.input.properties).toHaveProperty('name')
    expect(answer.tools[0]!.input.properties).not.toHaveProperty('runId')
  })

  it('says so in one line, naming the areas, when nothing is found', async () => {
    mockCallHqData.mockResolvedValue({ tools: [] })
    const answer = json(await call('find_tools', { query: 'zzqx' }))
    expect(answer.tools).toEqual([])
    expect(answer.note).toMatch(/No tool matches/)
  })

  it('offers a run none of the withdrawn legacy tools, shown or found', () => {
    const { shown, folded } = runForwardedTools(opts)
    for (const name of ['fetch_my_queued_tasks', 'tick_subtask']) expect(shown.has(name) || folded.has(name), name).toBe(false)
  })

  it('never searches a tool the run is not offered: at Never, or one it may not change', () => {
    const { folded } = runForwardedTools({ ...opts, disabledTools: new Set(['create_milestone']) })
    expect(folded.has('create_milestone')).toBe(false)
    expect(folded.has('update_milestone')).toBe(true)
  })

  it('never searches a tool at Ask in a run nobody can approve', () => {
    const unattended = { runId: 'run-7', sessionId: 's1', bypassed: false, approvedManifest: null, allowedTools: [{ name: 'create_milestone', state: 'ask' }] } as never
    const { folded } = runForwardedTools({ ...opts, siteTools: { context: unattended, openCode: false } })
    expect(folded.has('create_milestone')).toBe(false)
  })
})

describe('use_tool @SC-2181', () => {
  it('forwards a found tool as its native call, with the calling run filled in where it takes one', async () => {
    mockCallHqData.mockResolvedValue({ id: 'wr-1' })
    const answer = await call('use_tool', { name: 'run_workflow', input: { name: 'deploy-staging', runId: 'someone-elses' } })
    expect(mockCallHqData).toHaveBeenCalledWith('run_workflow', { name: 'deploy-staging', runId: 'run-7' }, 'jwt-1')
    expect(JSON.parse(answer.content[0]!.text)).toEqual({ id: 'wr-1' })
  })

  it('reads an input sent as JSON text, and may call a must-have too', async () => {
    mockCallHqData.mockResolvedValue({ ok: true })
    await call('use_tool', { name: 'create_milestone', input: '{"projectId":"WEB","name":"Beta","date":"2026-12-01"}' })
    expect(mockCallHqData).toHaveBeenCalledWith('create_milestone', { projectId: 'WEB', name: 'Beta', date: '2026-12-01' }, 'jwt-1')
    await call('use_tool', { name: 'get_task_details', input: { taskId: 'WEB-1' } })
    expect(mockCallHqData).toHaveBeenLastCalledWith('get_task_details', { taskId: 'WEB-1' }, 'jwt-1')
  })

  it('refuses, in one line that says to search, a tool that does not exist or the run is not offered', async () => {
    for (const name of ['no_such_tool', 'commit']) {
      const answer = await call('use_tool', { name, input: {} })
      expect(answer.isError).toBe(true)
      expect(answer.content[0]!.text).toMatch(/Search with find_tools/)
    }
    expect(mockCallHqData).not.toHaveBeenCalled()
  })

  it('refuses an input its tool does not accept, and a tool the site serves itself, running nothing', async () => {
    const invalid = await call('use_tool', { name: 'create_milestone', input: { name: 3 } })
    expect(invalid.isError).toBe(true)
    expect(invalid.content[0]!.text).toMatch(/^The input does not fit create_milestone: .*Its input: \{.*"name".*Call use_tool again/)
    const own = await call('use_tool', { name: 'stop_processes', input: {} })
    expect(own.content[0]!.text).toMatch(/call it directly/)
    expect(mockCallHqData).not.toHaveBeenCalled()
  })

  it('says hq\'s refusal as a tool error', async () => {
    mockCallHqData.mockRejectedValue(new FakeHqDataError('forbidden'))
    expect((await call('use_tool', { name: 'list_agents', input: {} })).isError).toBe(true)
  })
})
