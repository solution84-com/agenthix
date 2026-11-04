/**
 * adr-0083, spec §3: a process belongs to the conversation that started it,
 * and ends when that conversation has been idle for the machine's idle time or
 * has ended. A fake container stands in for docker: a table of processes, each
 * with the tag it carries (or none), which the fake finder clears by exact
 * match as the real one does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() })),
}))
vi.mock('../selectRuntime', () => ({ selectRuntime: vi.fn() }))
vi.mock('../../../server/runtime/conversationTokens', () => ({ revokeConversationToken: vi.fn() }))

import { ConversationLifecycle, conversationIdleMs, conversationStagingDir, type ConversationLifecycleDeps } from '../conversationLifecycle'
import type { EndConversationProcessesResult } from '../conversationProcesses'
import type { AgentRuntime, ConversationRef } from '../types'

const CONTAINER = 'agenthix-agent-project-p1-person-u1-rw'
const HOME = '/site/run-staging/users/u1/p1'
const IDLE_MS = 30 * 60_000

interface Process { pid: number; tag: string | null; what: string }

/** One container's processes, and a finder over them that matches the tag exactly. */
class FakeContainer {
  private next = 100
  processes: Process[] = []

  start(tag: string | null, what: string): number {
    const pid = this.next++
    this.processes.push({ pid, tag, what })
    return pid
  }

  running(what: string): boolean {
    return this.processes.some(p => p.what === what)
  }

  endProcesses = vi.fn(async (container: string, conversationId: string): Promise<EndConversationProcessesResult> => {
    if (container !== CONTAINER) return { kind: 'failed', error: `No such container: ${container}` }
    const before = this.processes.length
    this.processes = this.processes.filter(p => p.tag !== conversationId)
    return { kind: 'cleared', passes: before === this.processes.length ? 0 : 1 }
  })
}

/**
 * A runtime with one shared server per container, as OpenCode's: started with
 * no conversation's tag, it serves every conversation, and stops only when the
 * last conversation it serves lets go of it.
 */
class FakeSharedServerRuntime implements AgentRuntime {
  live = new Set<string>()
  calls: string[] = []
  constructor(private container: FakeContainer) {}

  serve(conversationId: string): void {
    if (!this.container.running('server')) this.container.start(null, 'server')
    this.live.add(conversationId)
  }

  async *run() { /* not driven here */ }
  async sessionExists() { return true }
  async conversationIdle(ref: ConversationRef) { this.calls.push(`idle:${ref.sessionId}`); this.letGo(ref.sessionId) }
  async endConversation(ref: ConversationRef) { this.calls.push(`end:${ref.sessionId}`); this.letGo(ref.sessionId) }

  private letGo(conversationId: string): void {
    this.live.delete(conversationId)
    if (this.live.size === 0) this.container.processes = this.container.processes.filter(p => p.what !== 'server')
  }
}

function setup(over: Partial<ConversationLifecycleDeps> = {}) {
  const container = new FakeContainer()
  const runtime = new FakeSharedServerRuntime(container)
  const order: string[] = []
  const held = new Set<string>()
  const deps: ConversationLifecycleDeps = {
    idleMs: () => IDLE_MS,
    endProcesses: async (c, id) => { order.push(`processes:${id}`); return container.endProcesses(c, id) },
    revokeToken: vi.fn((id: string) => { order.push(`token:${id}`) }),
    removeDir: vi.fn(async (dir: string) => { order.push(`staging:${dir}`) }),
    resolveRuntime: vi.fn(() => runtime),
    isHeld: (id: string) => held.has(id),
    ...over,
  }
  const lifecycle = new ConversationLifecycle(deps)
  const place = { containerName: CONTAINER, runtime, runStagingServerDir: HOME }

  /** One turn of a conversation: its harness served, a process of its own started. */
  async function turn(id: string, what = `dev-server-${id}`): Promise<void> {
    await lifecycle.turnStarting(id)
    lifecycle.turnLaunched(id, place)
    runtime.serve(id)
    container.start(id, what)
    await lifecycle.turnEnded(id)
  }

  return { lifecycle, container, runtime, order, held, deps, turn, place }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.AGENT_SESSION_IDLE_MINUTES
})

describe('the idle timer', () => {
  it('releases a conversation once it has been idle for the idle time, and not before', async () => {
    const { lifecycle, container, turn } = setup()
    await turn('conv-a')

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1)
    expect(container.running('dev-server-conv-a')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(lifecycle.isTracked('conv-a')).toBe(false)
  })

  it('is never idle while a turn runs, and starts again from the end of the next turn', async () => {
    const { lifecycle, container, turn, place } = setup()
    await turn('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)

    await lifecycle.turnStarting('conv-a')
    lifecycle.turnLaunched('conv-a', place)
    await vi.advanceTimersByTimeAsync(IDLE_MS * 3)
    expect(container.running('dev-server-conv-a')).toBe(true)

    await lifecycle.turnEnded('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1)
    expect(container.running('dev-server-conv-a')).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(container.running('dev-server-conv-a')).toBe(false)
  })

  it('reads AGENT_SESSION_IDLE_MINUTES, 30 by default, and falls back on an unusable value', () => {
    expect(conversationIdleMs()).toBe(30 * 60_000)
    process.env.AGENT_SESSION_IDLE_MINUTES = '5'
    expect(conversationIdleMs()).toBe(5 * 60_000)
    process.env.AGENT_SESSION_IDLE_MINUTES = 'soon'
    expect(conversationIdleMs()).toBe(30 * 60_000)
  })

  it('revokes the token, tells the runtime, ends the processes and removes the staging, in that order', async () => {
    const { order, runtime, turn } = setup()
    const idle = runtime.conversationIdle.bind(runtime)
    runtime.conversationIdle = async ref => { order.push(`runtime:${ref.sessionId}`); return idle(ref) }
    await turn('conv-a')

    await vi.advanceTimersByTimeAsync(IDLE_MS)

    // The runtime goes before the finder, so a harness can close gracefully first.
    expect(order).toEqual([
      'token:conv-a',
      'runtime:conv-a',
      'processes:conv-a',
      `staging:${HOME}/skills/conversation-conv-a`,
    ])
    expect(runtime.calls).toEqual(['idle:conv-a'])
  })

  it('makes a turn arriving during a release wait for it, so its harness never starts into the kill', async () => {
    let finishKill!: () => void
    const killing = new Promise<void>(resolve => { finishKill = resolve })
    const { lifecycle, turn } = setup({
      endProcesses: async () => { await killing; return { kind: 'cleared', passes: 1 } },
    })
    await turn('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS)

    let started = false
    const next = lifecycle.turnStarting('conv-a').then(() => { started = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toBe(false)

    finishKill()
    await next
    expect(started).toBe(true)
  })

  it('keeps going when the finder or the runtime fails, and still removes the staging', async () => {
    const removeDir = vi.fn(async () => {})
    const { runtime, turn } = setup({
      endProcesses: async () => ({ kind: 'failed', error: 'daemon busy' }),
      removeDir,
    })
    runtime.conversationIdle = async () => { throw new Error('server gone') }
    await turn('conv-a')

    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(removeDir).toHaveBeenCalledWith(`${HOME}/skills/conversation-conv-a`)
  })
})

describe('two conversations in one container (5.31)', () => {
  it('one idles out and the other keeps its processes', async () => {
    const { container, turn, place, lifecycle, runtime } = setup()
    await turn('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS / 2)
    await lifecycle.turnStarting('conv-b')
    lifecycle.turnLaunched('conv-b', place)
    runtime.serve('conv-b')
    container.start('conv-b', 'dev-server-conv-b')
    container.start('conv-b', 'watcher-conv-b')
    await lifecycle.turnEnded('conv-b')

    await vi.advanceTimersByTimeAsync(IDLE_MS / 2)

    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(container.running('dev-server-conv-b')).toBe(true)
    expect(container.running('watcher-conv-b')).toBe(true)
    expect(container.endProcesses).toHaveBeenCalledTimes(1)
    expect(container.endProcesses).toHaveBeenCalledWith(CONTAINER, 'conv-a')
  })

  it('does not take a conversation whose id another begins with', async () => {
    const { container, turn } = setup()
    await turn('conv')
    container.start('conv-2', 'other')

    await vi.advanceTimersByTimeAsync(IDLE_MS)

    expect(container.running('dev-server-conv')).toBe(false)
    expect(container.running('other')).toBe(true)
  })
})

describe('the shared harness server (5.31)', () => {
  it("survives a conversation's end while another conversation it serves is live", async () => {
    const { container, turn, lifecycle, runtime } = setup()
    await turn('conv-a')
    await turn('conv-b')

    await lifecycle.endConversation('conv-a')

    expect(runtime.calls).toEqual(['end:conv-a'])
    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(container.running('server')).toBe(true)
    expect(container.running('dev-server-conv-b')).toBe(true)
  })

  it('is untouched by the finder even when the last conversation idles, and stops only when its runtime lets it go', async () => {
    const { container, turn, runtime } = setup()
    await turn('conv-a')
    const kill = container.endProcesses

    await vi.advanceTimersByTimeAsync(IDLE_MS)

    // The finder ran and cleared the conversation's own processes; the server
    // carries no tag, so it was the runtime's call that stopped it.
    expect(kill).toHaveBeenCalledWith(CONTAINER, 'conv-a')
    expect(runtime.calls).toEqual(['idle:conv-a'])
    expect(container.running('server')).toBe(false)
  })
})

describe('a preview held open (5.31)', () => {
  it('survives, and keeps its conversation from going idle until it is let go', async () => {
    const { container, turn, held, runtime } = setup()
    await turn('conv-a')
    // Started by the site, not by the conversation: it carries no tag.
    container.start(null, 'preview-dev-server')
    held.add('conv-a')

    await vi.advanceTimersByTimeAsync(IDLE_MS * 3)
    expect(container.running('preview-dev-server')).toBe(true)
    expect(container.running('dev-server-conv-a')).toBe(true)
    expect(runtime.calls).toEqual([])

    held.delete('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS)
    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(container.running('preview-dev-server')).toBe(true)
  })
})

describe('the end of a conversation', () => {
  it('releases at once and tells the runtime it has ended', async () => {
    const { container, turn, lifecycle, runtime, order } = setup()
    await turn('conv-a')

    await lifecycle.endConversation('conv-a')

    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(runtime.calls).toEqual(['end:conv-a'])
    expect(order[0]).toBe('token:conv-a')
    expect(lifecycle.isTracked('conv-a')).toBe(false)
  })

  it('ends a conversation with a turn still unwinding, and the turn does not start the timer again', async () => {
    const { container, lifecycle, runtime, place } = setup()
    await lifecycle.turnStarting('conv-a')
    lifecycle.turnLaunched('conv-a', place)
    runtime.serve('conv-a')
    container.start('conv-a', 'dev-server-conv-a')

    await lifecycle.endConversation('conv-a')
    expect(container.running('dev-server-conv-a')).toBe(false)

    await lifecycle.turnEnded('conv-a')
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2)
    expect(runtime.calls).toEqual(['end:conv-a'])
    expect(lifecycle.isTracked('conv-a')).toBe(false)
  })

  it('ends a turn that found its conversation closed', async () => {
    const { container, turn, lifecycle, runtime, place } = setup()
    await turn('conv-a')
    await lifecycle.turnStarting('conv-a')
    lifecycle.turnLaunched('conv-a', place)

    await lifecycle.turnEnded('conv-a', { ended: true })

    expect(container.running('dev-server-conv-a')).toBe(false)
    expect(runtime.calls).toEqual(['end:conv-a'])
  })

  it('uses what it is told for a conversation it has no turn on record for', async () => {
    const { container, lifecycle, runtime, deps, order } = setup()
    container.start('conv-z', 'left-over')

    await lifecycle.endConversation('conv-z', { containerName: CONTAINER, runtimeName: 'opencode', runStagingServerDir: HOME })

    expect(deps.resolveRuntime).toHaveBeenCalledWith('opencode')
    expect(container.running('left-over')).toBe(false)
    expect(runtime.calls).toEqual(['end:conv-z'])
    expect(order).toContain(`staging:${HOME}/skills/conversation-conv-z`)
  })

  it('still revokes the token when nothing else is known, and a runtime it cannot name is skipped', async () => {
    const { lifecycle, deps } = setup({ resolveRuntime: vi.fn(() => { throw new Error('not available') }) })

    await expect(lifecycle.endConversation('conv-z', { runtimeName: 'opencode' })).resolves.toBeUndefined()

    expect(deps.revokeToken).toHaveBeenCalledWith('conv-z')
    expect(deps.removeDir).not.toHaveBeenCalled()
  })
})

describe('conversationStagingDir', () => {
  it('is one folder per conversation inside the read-only staging folder', () => {
    expect(conversationStagingDir(HOME, 'conv-a')).toBe(`${HOME}/skills/conversation-conv-a`)
  })

  it('refuses an id that is not one path segment', () => {
    expect(() => conversationStagingDir(HOME, '../x')).toThrow()
    expect(() => conversationStagingDir(HOME, '')).toThrow()
  })
})
