/**
 * The tool search through a real `claude` process in the agent image (lean agent context spec §5–§6, ADR-0193):
 * `find_tools` and `use_tool` called on the platform server, with a stand-in for the Anthropic API — never a real
 * model.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts). It needs Docker and the agent image
 * (AGENT_IMAGE, `agenthix-agent:latest` by default), and is skipped when either is missing. One container, removed at
 * the end. The site's own app serves `/mcp` here, on this machine, which the container reaches through
 * host.docker.internal with the conversation's platform token, as a run's does; hq is stood in where the site calls
 * it (`callHqData`): a search finds `run_workflow`, and every other call is recorded and answered. The run's events
 * go through the run's own event loop, which records and streams each call.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const hq = vi.hoisted(() => ({
  logged: [] as Array<{ toolName: string; toolInput: unknown; blocked: boolean; blockReason?: string }>,
  forwarded: [] as Array<{ name: string; args: unknown }>,
  searched: [] as Array<{ query: string; among: string[] }>,
}))
vi.mock('#db', () => ({
  prisma: { toolCallLog: { create: vi.fn(async ({ data }: { data: (typeof hq.logged)[number] }) => { hq.logged.push(data); return {} }) } },
}))
vi.mock('../../../server/hq/dataClient', async importOriginal => {
  const real = await importOriginal<typeof import('../../../server/hq/dataClient')>()
  return {
    ...real,
    callHqData: vi.fn(async (operation: string, args: unknown) => {
      if (operation === 'find_tools') {
        hq.searched.push(args as (typeof hq.searched)[number])
        return { tools: [{ name: 'run_workflow', description: 'Run a workflow.', input: null }] }
      }
      hq.forwarded.push({ name: operation, args })
      return { ran: operation }
    }),
  }
})
// The conversation the capability names, and the tool the agent has at Never, as the capability carries them.
const { SESSION_ID, NEVER } = vi.hoisted(() => ({ SESSION_ID: crypto.randomUUID(), NEVER: 'propose_workflow' }))
vi.mock('../../../server/identity/verifyHqToken', () => ({
  verifyHqToken: vi.fn(async () => ({
    tokenType: 'capability', sessionId: SESSION_ID,
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [NEVER] },
  })),
}))

import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import { createApp } from '../../../server/app'
import { pointConversationToken, clearConversationTurn } from '../../../server/runtime/conversationTokens'
import { registerGateRun } from '../toolGateRuns'
import { consumeRunEvents, type StreamedRun } from '../runEventLoop'
import { siteStream } from '../SiteStreamEmitter'
import { withToolSearchTools } from '../toolSearchCall'
import { PLATFORM_AUTHORIZATION, PLATFORM_TOKEN_ENV } from '../agentImage'
import type { RunContext } from '../types'
import { claudeTestContext } from './claudeTestContext'
import { agentImagePresent, docker, startAgentContainer, startStandinAnthropic } from './agentContainerFixture'

const enabled = agentImagePresent()
const CONTAINER = process.env.AGENT_CLAUDE_TOOL_SEARCH_TEST_CONTAINER ?? 'ovi-toolsearch-claude-test'
const CWD = '/projects/p1/files'
const HOLDER = { jwt: 'holder-jwt', expiresAt: Date.now() + 60 * 60_000 }
const ASK = 'workflow_run'

let dir: string
let port = ''
let siteServer: http.Server
let stopStandin: (() => void) | undefined
const runtime = new ClaudeSDKRuntime()
const frames: Array<{ runId: string; name: string; data: { toolName?: string; toolInput?: unknown } }> = []

function context(prompt: string, overrides: Partial<RunContext>): RunContext {
  const sitePort = (siteServer.address() as { port: number }).port
  return claudeTestContext({
    runId: randomUUID(),
    sessionId: SESSION_ID,
    prompt,
    cwd: CWD,
    model: 'claude-sonnet-4-5',
    isNewSession: false,
    containerName: CONTAINER,
    credential: null,
    claudeHome: { serverDir: path.join(dir, 'home', '.claude'), visibleDir: '/home/appuser/.claude' },
    runStaging: { serverDir: path.join(dir, 'run-staging'), visibleDir: '/run/staging' },
    bypassed: false,
    allowedTools: withToolSearchTools([
      { name: 'run_workflow', state: 'always' }, { name: ASK, state: 'ask' }, { name: NEVER, state: 'never' },
    ]),
    neverTools: [NEVER],
    approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
    deferredManifest: { tools: [], bashPatterns: [] },
    mcpServers: { platform: { type: 'http', url: `http://host.docker.internal:${sitePort}/mcp`, headers: { Authorization: PLATFORM_AUTHORIZATION } } },
    ...overrides,
  })
}

/** One turn as a run takes it: the conversation's token names it, the gate knows it, and its events are recorded. */
async function turn(prompt: string, overrides: Partial<RunContext> = {}): Promise<{ ctx: RunContext; streamed: StreamedRun }> {
  const ctx = context(prompt, overrides)
  const token = pointConversationToken(SESSION_ID, ctx.runId, HOLDER)
  // Not what a real run's git helper carries: the way this test points the process at the stand-in.
  ctx.gitCredEnv = {
    ANTHROPIC_BASE_URL: `http://host.docker.internal:${port}`, ANTHROPIC_API_KEY: 'sk-standin-toolsearch',
    HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost,host.docker.internal',
    DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    [PLATFORM_TOKEN_ENV]: token,
  }
  registerGateRun(ctx)
  try {
    const streamed = await consumeRunEvents(runtime.run(ctx), {
      runId: ctx.runId, sessionId: SESSION_ID, taskId: null, signal: new AbortController().signal,
    })
    return { ctx, streamed }
  } finally {
    clearConversationTurn(SESSION_ID, ctx.runId)
  }
}

const platformCall = (tool: string, input: unknown) => `DO:PLATFORM ${tool} ${JSON.stringify(input)}`
/** A platform tool's answer as the agent reads it: Claude Code reports an answer as its content blocks, an error as its text. */
function answerText(output: string): string {
  try {
    const blocks: unknown = JSON.parse(output)
    if (Array.isArray(blocks)) return blocks.map(b => (b as { text?: string }).text ?? '').join('')
  } catch { /* the error's own text */ }
  return output
}
const calls = (streamed: StreamedRun) => [...streamed.toolCallMap.values()]
const streamedCalls = (runId: string) =>
  frames.filter(f => f.runId === runId && f.name === 'agentToolCall').map(f => ({ toolName: f.data.toolName, toolInput: f.data.toolInput }))

describe.skipIf(!enabled)('the tool search, in a real claude process @SC-2182', () => {
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ovi-toolsearch-'))
    const standin = await startStandinAnthropic(dir)
    port = standin.port
    stopStandin = () => standin.child.kill()
    vi.spyOn(siteStream, 'stream').mockImplementation(e => { frames.push(e as unknown as (typeof frames)[number]) })
    siteServer = http.createServer(createApp())
    await new Promise<void>(resolve => siteServer.listen(0, '0.0.0.0', resolve))
    await startAgentContainer(CONTAINER, dir)
  }, 120_000)

  afterAll(async () => {
    await runtime.endConversation({ sessionId: SESSION_ID, containerName: CONTAINER }).catch(() => {})
    await docker('rm', '-f', CONTAINER).catch(() => '')
    siteServer?.closeAllConnections()
    await new Promise<void>(resolve => siteServer ? siteServer.close(() => resolve()) : resolve())
    stopStandin?.()
    await fs.rm(dir, { recursive: true, force: true })
  }, 60_000)

  beforeEach(() => {
    hq.logged.length = 0
    hq.forwarded.length = 0
    hq.searched.length = 0
  })

  it('finds a folded tool, and runs it through use_tool as its own call: forwarded, recorded and streamed by its name', async () => {
    const { ctx, streamed } = await turn([
      'TURN 1',
      platformCall('find_tools', { query: 'run a workflow' }),
      platformCall('use_tool', { name: 'run_workflow', input: { name: 'push' } }),
    ].join('\n'), { isNewSession: true })

    // hq searched among the tools the run is offered and not shown: never one at Never.
    expect(hq.searched).toHaveLength(1)
    expect(hq.searched[0]!.among).toEqual(expect.arrayContaining(['run_workflow', ASK]))
    expect(hq.searched[0]!.among).not.toContain(NEVER)
    const [found, ran] = calls(streamed)
    expect(found).toMatchObject({ toolName: 'mcp__platform__find_tools', toolInput: { query: 'run a workflow' } })
    expect(JSON.parse(answerText(found!.output!))).toMatchObject({ tools: [{ name: 'run_workflow' }] })

    // Forwarded as run_workflow, with the calling run filled in.
    expect(hq.forwarded).toEqual([{ name: 'run_workflow', args: { name: 'push', runId: ctx.runId } }])
    expect(ran).toMatchObject({ toolName: 'mcp__platform__run_workflow', toolInput: { name: 'push' } })
    expect(JSON.parse(answerText(ran!.output!))).toEqual({ ran: 'run_workflow' })
    expect(streamedCalls(ctx.runId)).toEqual([
      { toolName: 'mcp__platform__find_tools', toolInput: { query: 'run a workflow' } },
      { toolName: 'mcp__platform__run_workflow', toolInput: { name: 'push' } },
    ])
    expect(hq.logged.map(r => ({ toolName: r.toolName, toolInput: r.toolInput, blocked: r.blocked }))).toEqual([
      { toolName: 'find_tools', toolInput: { query: 'run a workflow' }, blocked: false },
      { toolName: 'run_workflow', toolInput: { name: 'push' }, blocked: false },
    ])
  }, 120_000)

  it('refuses a tool at Never named through use_tool, at the gate, recorded by its name, and forwards nothing', async () => {
    const { ctx, streamed } = await turn(['TURN 2', platformCall('use_tool', { name: NEVER, input: { path: 'w.yaml' } })].join('\n'))

    const [refused] = calls(streamed)
    expect(refused).toMatchObject({ toolName: `mcp__platform__${NEVER}`, toolInput: { path: 'w.yaml' } })
    expect(refused!.output).toContain(`${NEVER} is not available for this agent.`)
    expect(streamedCalls(ctx.runId)).toEqual([{ toolName: `mcp__platform__${NEVER}`, toolInput: { path: 'w.yaml' } }])
    expect(hq.logged).toEqual([expect.objectContaining({ toolName: NEVER, toolInput: { path: 'w.yaml' }, blocked: true, blockReason: 'tool-never' })])
    expect(hq.forwarded).toEqual([])
  }, 120_000)

  it('holds a tool at Ask named through use_tool for approval by its name, and runs it once approved', async () => {
    const asking = platformCall('use_tool', { name: ASK, input: { id: 'wr-1' }, reason: 'to check the deploy' })
    const waiting = await turn(`TURN 3\n${asking}`)

    expect(waiting.ctx.deferredManifest!.tools).toEqual([{ name: ASK, reason: 'to check the deploy' }])
    expect(calls(waiting.streamed)[0]!.toolName).toBe(`mcp__platform__${ASK}`)
    expect(calls(waiting.streamed)[0]!.output).toContain(`${ASK} was not run: it needs a person's approval`)
    expect(hq.logged).toEqual([expect.objectContaining({ toolName: ASK, toolInput: { id: 'wr-1' }, blocked: true, blockReason: 'tool-deferred' })])
    expect(hq.forwarded).toEqual([])

    hq.logged.length = 0
    const approved = await turn(`TURN 4\n${asking}`, { approvedManifest: { tools: [ASK], bashPatterns: [], approvedAt: 't' } })
    expect(approved.ctx.deferredManifest!.tools).toEqual([])
    expect(hq.forwarded).toEqual([{ name: ASK, args: { id: 'wr-1', runId: approved.ctx.runId } }])
    expect(calls(approved.streamed)[0]).toMatchObject({ toolName: `mcp__platform__${ASK}`, toolInput: { id: 'wr-1' } })
    expect(hq.logged).toEqual([expect.objectContaining({ toolName: ASK, blocked: false })])
  }, 120_000)

  it("answers a use_tool whose input does not fit with the tool's input format, and forwards nothing", async () => {
    const { streamed } = await turn(['TURN 5', platformCall('use_tool', { name: 'run_workflow', input: { workspace: 'demo' } })].join('\n'))

    const [misfit] = calls(streamed)
    expect(misfit).toMatchObject({ toolName: 'mcp__platform__run_workflow', toolInput: { workspace: 'demo' } })
    const answer = answerText(misfit!.output!)
    expect(answer).toMatch(/^The input does not fit run_workflow: name: .+ Nothing was run\. run_workflow: Run a workflow's approved version/)
    const format = JSON.parse(answer.match(/Its input: (\{.*\})\. Call use_tool again with input that fits\.$/)![1]!) as { required: string[]; properties: object }
    expect(format.required).toEqual(['name'])
    // What the agent is shown of the tool: the run's id is filled in by the site, never asked for.
    expect(Object.keys(format.properties)).not.toContain('runId')
    expect(hq.forwarded).toEqual([])
  }, 120_000)
})
