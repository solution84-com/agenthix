import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DemoRunScript, DemoScripts, RunLimitKind, RunLimits } from '@agenthix/core'
import { ScriptedRuntime, type ScriptedRuntimeDeps } from '../ScriptedRuntime'
import { reviewColumnOf } from '../handOver'
import type { RunContext, RunEvent } from '../../../agents/runtime/types'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'scripted-')) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const run = (id: string, target: DemoRunScript['for'], over: Partial<DemoRunScript> = {}): DemoRunScript => ({
  format: 1, id, for: target, events: [], files: [], end: { status: 'completed' }, ...over,
})

function scripts(...runs: DemoRunScript[]): DemoScripts {
  return { agents: { writer: { lead: {} as never, runs } } }
}

function context(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'r1', sessionId: 's1', taskId: null, projectId: null, model: 'demo-model', prompt: 'hi',
    agent: { id: 'a1', handle: 'writer', name: 'Writer', systemPrompt: null, defaultModel: 'demo-model' },
    workingTreeDir: root, cwd: root, ...over,
  } as RunContext
}

/** What the runtime did beyond its events: the calls it logged, the tasks it handed over and the limits it stopped at. */
type Done = { logged: string[]; handedOver: string[]; stopped: { runId: string; limit: RunLimitKind; limits: RunLimits }[] }

function quietDeps(done: Done): Partial<ScriptedRuntimeDeps> {
  return {
    recordCall: async (_c, call) => { done.logged.push(`${call.toolUseId}:${call.toolName}`) },
    handOver: async c => { done.handedOver.push(c.taskId ?? '') },
    stopAtLimit: async (c, limit, limits) => { done.stopped.push({ runId: c.runId, limit, limits }) },
  }
}

async function play(s: DemoScripts, ctx: RunContext, waited: number[] = [], done: Done = { logged: [], handedOver: [], stopped: [] }): Promise<RunEvent[]> {
  const runtime = new ScriptedRuntime({ scripts: async () => s, wait: async ms => { waited.push(ms) }, ...quietDeps(done) })
  const out: RunEvent[] = []
  for await (const e of runtime.run(ctx)) out.push(e)
  return out
}

describe('ScriptedRuntime', () => {
  it('yields the script events as the site\'s run events, after their delays, and completes @SC-1986', async () => {
    const waited: number[] = []
    const events = await play(scripts(run('general', { default: true }, {
      events: [
        { type: 'thinking', afterMs: 100, thinking: 'hm' },
        { type: 'tool_call', afterMs: 200, toolUseId: 't', toolName: 'Read', toolInput: { p: 1 } },
        { type: 'tool_result', afterMs: 300, toolUseId: 't', output: 'ok' },
        { type: 'text_delta', afterMs: 400, textDelta: 'done' },
      ],
    })), context(), waited)
    expect(waited).toEqual([100, 200, 300, 400])
    expect(events.map(e => e.type)).toEqual(['status', 'thinking', 'tool_call', 'tool_result', 'text_delta', 'status'])
    expect(events[1]).toEqual({ type: 'thinking', thinking: 'hm' })
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'completed' })
  })

  it('picks the task\'s script by its key, else the agent\'s default @SC-1986', async () => {
    const s = scripts(
      run('general', { default: true }, { events: [{ type: 'text_delta', afterMs: 0, textDelta: 'general' }] }),
      run('web-2', { task: 'WEB-2' }, { events: [{ type: 'text_delta', afterMs: 0, textDelta: 'web-2' }] }),
    )
    const text = (es: RunEvent[]) => es.flatMap(e => e.type === 'text_delta' ? [e.textDelta] : []).join('')
    expect(text(await play(s, context({ ownTask: { id: 'x', key: 'WEB-2' } })))).toBe('web-2')
    expect(text(await play(s, context({ ownTask: { id: 'x', key: 'WEB-9' } })))).toBe('general')
    expect(text(await play(s, context()))).toBe('general')
  })

  it('writes the script\'s files into the run\'s workspace @SC-1986', async () => {
    await play(scripts(run('general', { default: true }, { files: [{ path: 'pages/home.md', content: '# Hi' }] })), context())
    expect(await fs.readFile(path.join(root, 'pages/home.md'), 'utf8')).toBe('# Hi')
  })

  it('refuses a file that would land outside the workspace, and fails the run @SC-1986', async () => {
    const outside = path.join(path.dirname(root), 'escaped.md')
    const events = await play(scripts(run('general', { default: true }, { files: [{ path: '../escaped.md', content: 'x' }] })), context())
    await expect(fs.access(outside)).rejects.toThrow()
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'failed' })
  })

  it('ends a failed script as failed with its error @SC-1988', async () => {
    const events = await play(scripts(run('general', { default: true }, { end: { status: 'failed', error: 'It broke' } })), context())
    expect(events.at(-1)).toMatchObject({ status: 'failed', error: 'It broke' })
  })

  it('ends a limit script as a run stopped by its limit, with the run\'s own limits: never failed @SC-1988', async () => {
    const done: Done = { logged: [], handedOver: [], stopped: [] }
    const events = await play(
      scripts(run('general', { default: true }, { end: { status: 'limit', limit: 'turns' } })),
      context({ taskId: 't1', runLimits: { timeLimitMinutes: 5, turnLimit: 7 } }), [], done,
    )
    expect(done.stopped).toEqual([{ runId: 'r1', limit: 'turns', limits: { timeLimitMinutes: 5, turnLimit: 7 } }])
    expect(events.some(e => e.type === 'status' && e.status !== 'running')).toBe(false)
    expect(done.handedOver).toEqual([])
  })

  it('writes each tool call into the run\'s tool-call log as it plays, as a harness\'s run does @SC-1987', async () => {
    const done: Done = { logged: [], handedOver: [], stopped: [] }
    await play(scripts(run('general', { default: true }, {
      events: [
        { type: 'tool_call', afterMs: 0, toolUseId: 'read', toolName: 'Read', toolInput: { file_path: 'a.md' } },
        { type: 'tool_result', afterMs: 0, toolUseId: 'read', output: 'ok' },
        { type: 'tool_call', afterMs: 0, toolUseId: 'write', toolName: 'Write', toolInput: { file_path: 'b.md' } },
      ],
    })), context(), [], done)
    expect(done.logged).toEqual(['read:Read', 'write:Write'])
  })

  it('goes on when the log cannot take a call @SC-1987', async () => {
    const runtime = new ScriptedRuntime({
      scripts: async () => scripts(run('general', { default: true }, { events: [{ type: 'tool_call', afterMs: 0, toolUseId: 'r', toolName: 'Read', toolInput: {} }] })),
      wait: async () => {}, recordCall: async () => { throw new Error('no database') }, handOver: async () => {},
    })
    const out: RunEvent[] = []
    for await (const e of runtime.run(context())) out.push(e)
    expect(out.at(-1)).toMatchObject({ type: 'status', status: 'completed' })
  })

  it('hands a completed task run\'s task over for review, and no other run\'s @SC-1989', async () => {
    const done: Done = { logged: [], handedOver: [], stopped: [] }
    await play(scripts(run('general', { default: true })), context({ taskId: 't1' }), [], done)
    await play(scripts(run('general', { default: true })), context(), [], done)
    await play(scripts(run('general', { default: true }, { end: { status: 'failed', error: 'x' } })), context({ taskId: 't2' }), [], done)
    expect(done.handedOver).toEqual(['t1'])
  })

  it('hands over to the task type\'s review column, unless the task is there already or its type has none @SC-1989', () => {
    const typeColumns = [
      { columnId: 'todo', name: 'To do' }, { columnId: 'doing', name: 'In progress' }, { columnId: 'review', name: 'In review' },
    ]
    expect(reviewColumnOf({ columnId: 'doing', typeColumns })).toBe('review')
    expect(reviewColumnOf({ columnId: 'review', typeColumns })).toBeNull()
    expect(reviewColumnOf({ columnId: 'doing', typeColumns: typeColumns.slice(0, 2) })).toBeNull()
    expect(reviewColumnOf({})).toBeNull()
  })

  it('stops at once when cancelled: no more events, no files, no end @SC-1988', async () => {
    const controller = new AbortController()
    const runtime = new ScriptedRuntime({
      scripts: async () => scripts(run('general', { default: true }, {
        events: [
          { type: 'text_delta', afterMs: 0, textDelta: 'one' },
          { type: 'text_delta', afterMs: 0, textDelta: 'two' },
        ],
        files: [{ path: 'a.md', content: 'a' }],
      })),
      wait: async () => {},
    })
    const seen: RunEvent[] = []
    for await (const e of runtime.run(context({ abortSignal: controller.signal }))) {
      seen.push(e)
      if (e.type === 'text_delta') controller.abort()
    }
    expect(seen.filter(e => e.type === 'text_delta')).toHaveLength(1)
    expect(seen.some(e => e.type === 'status' && e.status !== 'running')).toBe(false)
    await expect(fs.access(path.join(root, 'a.md'))).rejects.toThrow()
  })

  it('with its real wait, an abort during a long delay ends the run at once @SC-1988', async () => {
    const controller = new AbortController()
    const runtime = new ScriptedRuntime({
      scripts: async () => scripts(run('g', { default: true }, { events: [{ type: 'notice', afterMs: 10_000, notice: 'slow' }] })),
      wait: (await import('../ScriptedRuntime')).waitUnlessAborted,
    })
    setTimeout(() => controller.abort(), 20)
    const started = Date.now()
    const seen: RunEvent[] = []
    for await (const e of runtime.run(context({ abortSignal: controller.signal }))) seen.push(e)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(seen.some(e => e.type === 'notice')).toBe(false)
  })

  it('completes with a plain line when the agent has no script @SC-1986', async () => {
    const events = await play({ agents: {} }, context())
    expect(events.at(-1)).toMatchObject({ status: 'completed' })
    expect(events.some(e => e.type === 'text_delta')).toBe(true)
  })

  it('fails the run, calling no model, when the scripts cannot be read @SC-1986', async () => {
    const runtime = new ScriptedRuntime({ scripts: async () => { throw new Error('bad') }, wait: async () => {} })
    const out: RunEvent[] = []
    for await (const e of runtime.run(context())) out.push(e)
    expect(out).toEqual([{ type: 'status', status: 'failed', error: expect.stringContaining('bad') }])
  })

  it('holds no harness state: a session always exists, idle and end do nothing @SC-1986', async () => {
    const runtime = new ScriptedRuntime()
    await expect(runtime.sessionExists({ sessionId: 's', harnessHomeDir: '/x', workingDirectory: '/y' })).resolves.toBe(true)
    await expect(runtime.conversationIdle({ sessionId: 's', containerName: null })).resolves.toBeUndefined()
    await expect(runtime.endConversation({ sessionId: 's', containerName: null })).resolves.toBeUndefined()
  })

  describe('the run\'s result @SC-1989', () => {
    const task = { taskId: 't1', ownTask: { id: 't1', key: 'WEB-4' } }
    const events = [
      { type: 'text_delta', afterMs: 0, textDelta: 'Looking.' },
      { type: 'tool_call', afterMs: 0, toolUseId: 't', toolName: 'Read', toolInput: {} },
      { type: 'tool_result', afterMs: 0, toolUseId: 't', output: 'ok' },
      { type: 'text_delta', afterMs: 0, textDelta: 'The page is ' },
      { type: 'text_delta', afterMs: 0, textDelta: 'in pages/work.md. ' },
    ] as DemoRunScript['events']

    async function playStating(over: Partial<DemoRunScript>, ctx: RunContext) {
      const stated: { runId: string; result: string }[] = []
      const order: string[] = []
      const runtime = new ScriptedRuntime({
        scripts: async () => scripts(run('general', { default: true }, { events, ...over })),
        wait: async () => {},
        stateResult: async (c, result) => { stated.push({ runId: c.runId, result }); order.push('stated') },
        recordCall: async () => {}, handOver: async () => { order.push('handed over') }, stopAtLimit: async () => {},
      })
      const out: RunEvent[] = []
      for await (const e of runtime.run(ctx)) { out.push(e); if (e.type === 'status' && e.status === 'completed') order.push('completed') }
      return { stated, order, out }
    }

    it('states the final text as the result of a completed task run, before the run ends', async () => {
      const { stated, order } = await playStating({}, context(task))
      expect(stated).toEqual([{ runId: 'r1', result: 'The page is in pages/work.md.' }])
      expect(order).toEqual(['stated', 'handed over', 'completed'])
    })

    it('states none for a failed or limit-stopped run', async () => {
      expect((await playStating({ end: { status: 'failed', error: 'x' } }, context(task))).stated).toEqual([])
      expect((await playStating({ end: { status: 'limit', limit: 'turns' } }, context(task))).stated).toEqual([])
    })

    it('states none for a run of no task, or a script that ends on a tool or says nothing', async () => {
      expect((await playStating({}, context())).stated).toEqual([])
      expect((await playStating({ events: events.slice(0, 3) }, context(task))).stated).toEqual([])
    })
  })
})
