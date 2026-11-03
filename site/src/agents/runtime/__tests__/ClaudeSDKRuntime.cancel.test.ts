/**
 * A cancel is the turn's `interrupt()`, and `interrupt()` rejects once
 * the `claude` process has ended. An unobserved rejection ends the site with
 * every turn running on it, so a cancel — during a turn, or after it — must
 * never leave one behind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/site/homes/h/.tmp/skills-1'),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
    realpath: vi.fn(async (p: string) => p),
  },
}))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))
vi.mock('../skillStaging', () => ({ stageSkills: vi.fn(async () => ({ staged: [], refused: [] })) }))

import { query } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import type { RunContext, RunEvent } from '../types'
import { fakeClaudeQueries } from './fakeClaudeQuery'
import { claudeTestContext } from './claudeTestContext'

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => { unhandled.push(reason) }

async function drain(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

/** Long enough for a rejected promise nobody handles to be reported. */
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

describe('cancelling a Claude turn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unhandled.length = 0
    process.on('unhandledRejection', onUnhandled)
  })
  afterEach(async () => {
    await new ClaudeSDKRuntime().endConversation({ sessionId: 'session-1', containerName: null })
    process.off('unhandledRejection', onUnhandled)
  })

  it('a cancel arriving after the turn finished and its process exited leaves the site running', async () => {
    const fake = fakeClaudeQueries(() => [{ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }])
    vi.mocked(query).mockImplementation(fake.start)
    const controller = new AbortController()
    const context: RunContext = { ...claudeTestContext(), abortSignal: controller.signal }

    await drain(new ClaudeSDKRuntime().run(context))
    // The process has gone, and the run's controller is still registered.
    for (const q of fake.started) q.die()
    controller.abort()
    await settle()

    expect(unhandled).toEqual([])
  })

  it('a cancel whose interrupt is refused by an ended process leaves the site running', async () => {
    const controller = new AbortController()
    const fake = fakeClaudeQueries((_turn, _text, q) => {
      // The process dies just as the cancel arrives.
      setTimeout(() => { q.die(); controller.abort() }, 5)
      return 'hang'
    })
    vi.mocked(query).mockImplementation(fake.start)
    const context: RunContext = { ...claudeTestContext(), abortSignal: controller.signal }

    await drain(new ClaudeSDKRuntime().run(context)).catch(() => [])
    await settle()

    expect(unhandled).toEqual([])
  })

  it('a cancel during a turn stops it through interrupt', async () => {
    const controller = new AbortController()
    const fake = fakeClaudeQueries(() => {
      setTimeout(() => controller.abort(), 5)
      return 'hang'
    })
    vi.mocked(query).mockImplementation(fake.start)
    const context: RunContext = { ...claudeTestContext(), abortSignal: controller.signal }

    await drain(new ClaudeSDKRuntime().run(context))
    await settle()

    expect(fake.started[0]!.calls.interrupt).toBe(1)
    expect(unhandled).toEqual([])
  })
})
