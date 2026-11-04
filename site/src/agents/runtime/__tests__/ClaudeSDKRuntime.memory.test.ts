/**
 * Claude Code's memory of a conversation: where it summarised, with the
 * summary its PostCompact hook handed over, and how full it is as each turn
 * ends — asked of the process, else read off the turn's result. Scaffold as
 * ClaudeSDKRuntime.conversation.test.ts.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))
vi.mock('../skillStaging', () => ({ stageSkills: vi.fn(async () => ({ staged: [], refused: [] })) }))
vi.mock('../landlockCheck', () => ({ requireLandlock: vi.fn(async () => {}) }))
vi.mock('../claude/claudeProcessProbe', () => ({
  claudeProcessMemoryMb: vi.fn().mockResolvedValue(300),
  killClaudeProcess: vi.fn().mockResolvedValue(0),
  harnessMemoryCeilingMb: vi.fn(() => 1024),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import type { RunContext, RunEvent } from '../types'
import { fakeClaudeQueries, type TurnScript } from './fakeClaudeQuery'
import { claudeTestContext } from './claudeTestContext'

let home: string
const runtime = new ClaudeSDKRuntime()

async function turn(script: TurnScript, overrides: Partial<RunContext> = {}) {
  const fake = fakeClaudeQueries(script)
  vi.mocked(query).mockImplementation(fake.start)
  const context = claudeTestContext({ claudeHome: { serverDir: home, visibleDir: home }, runStaging: { serverDir: path.join(home, 'run-staging'), visibleDir: path.join(home, 'run-staging') }, ...overrides })
  const events: RunEvent[] = []
  for await (const e of runtime.run(context)) events.push(e)
  return { events, fake }
}

const assistant = (usage: Record<string, number>) => ({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-4-6', content: [], usage } })

describe("Claude Code's memory of the conversation @SC-775", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-'))
  })
  afterEach(async () => {
    await runtime.endConversation({ sessionId: 'session-1', containerName: null })
    await fs.rm(home, { recursive: true, force: true })
  })

  it('says how full it is as the turn ends, from the process itself', async () => {
    const { events } = await turn((_n, _t, q) => {
      q.contextUsage = { totalTokens: 124_000, maxTokens: 187_000, rawMaxTokens: 200_000, autoCompactThreshold: 184_000, isAutoCompactEnabled: true }
      return []
    })
    const use = events.find(e => e.type === 'context_use')
    expect(use).toMatchObject({ use: { tokens: 124_000, summarisesAt: 184_000, window: 200_000 } })
    expect(events.indexOf(use!)).toBeLessThan(events.findIndex(e => e.type === 'status'))
  })

  it("reads it off the turn's result when the process does not answer", async () => {
    const { events } = await turn(() => [
      assistant({ input_tokens: 10, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 1_000, output_tokens: 200 }),
      { type: 'result', subtype: 'success', num_turns: 1, modelUsage: { 'claude-sonnet-4-6': { contextWindow: 200_000 } } },
    ])
    expect(events.find(e => e.type === 'context_use')).toMatchObject({ use: { tokens: 51_210, summarisesAt: null, window: 200_000 } })
  })

  it('says nothing about it when neither the process nor the result does', async () => {
    const { events } = await turn(() => [])
    expect(events.some(e => e.type === 'context_use')).toBe(false)
  })

  it('reports where it summarised, with the summary from its PostCompact hook', async () => {
    const { events } = await turn((_n, text, q) => {
      void q.postCompact('manual', 'Avery is redesigning the project page.')
      return [{ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 188_000 } }]
    }, { prompt: '/compact', summarise: true })
    expect(events.filter(e => e.type === 'compacted')).toEqual([
      { type: 'compacted', trigger: 'manual', summary: 'Avery is redesigning the project page.', tokensBefore: 188_000 },
    ])
  })

  it('asks Claude Code to summarise with its own /compact command @SC-776', async () => {
    const { fake } = await turn(() => [], { prompt: '/compact', summarise: true })
    expect(fake.started[0]!.turns).toEqual(['/compact'])
  })
})
