import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DemoScriptError, loadDemoScripts, parseDemoFiles, type DemoFiles } from '../load.js'
import { matchDemoIntent, pickDemoRunScript } from '../match.js'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../demo')
const nodeReader = { list: (dir: string) => readdir(dir), read: (file: string) => readFile(file, 'utf8') }

const lead = (over: Record<string, unknown> = {}) => ({
  format: 1, agent: 'writer',
  intents: [{ id: 'hello', phrasings: ['say hello'], reply: 'Hello.' }],
  fallback: { reply: 'This is a demo.' },
  spoken: {
    workCameBack: { text: 'That work has come back.' }, done: { text: "That's started." },
    refused: { text: "That didn't go through." }, waiting: { text: 'It is waiting for your okay.' },
  },
  suggestedPrompts: ['say hello'],
  voiceLines: [{ text: 'Say hello', intent: 'hello' }],
  firstVoiceLine: { text: 'This is a demo voice.' },
  ...over,
})
const run = (id: string, over: Record<string, unknown> = {}) => ({
  format: 1, id, for: { default: true },
  events: [{ type: 'text_delta', afterMs: 100, textDelta: 'Done.' }],
  end: { status: 'completed' },
  ...over,
})
const files = (json: Record<string, unknown>, voiceClips: string[] = []): DemoFiles =>
  ({ json: Object.entries(json).map(([p, v]) => ({ path: p, text: typeof v === 'string' ? v : JSON.stringify(v) })), voiceClips })
const problems = (f: DemoFiles): string[] => {
  try { parseDemoFiles(f) } catch (e) { if (e instanceof DemoScriptError) return e.problems.map(p => `${p.at}: ${p.message}`); throw e }
  return []
}

describe('the demo folder in the repository @SC-1983', () => {
  it('loads through the loader with no problem', async () => {
    const scripts = await loadDemoScripts(REPO_DEMO, nodeReader)
    expect(Object.keys(scripts.agents)).toContain('writer')
    const writer = scripts.agents.writer
    expect(matchDemoIntent('how is the home page copy going?', writer.lead.intents)?.id).toBe('draft-home-page')
    expect(pickDemoRunScript(writer.runs, { taskKey: 'WEB-2' })?.end).toEqual({ status: 'limit', limit: 'turns' })
    expect(pickDemoRunScript(writer.runs, { taskKey: 'WEB-9' })?.id).toBe('general')
  })

  it("keeps every run short: each finishes within ten seconds, its steps arriving one by one", async () => {
    const scripts = await loadDemoScripts(REPO_DEMO, nodeReader)
    for (const [handle, agent] of Object.entries(scripts.agents)) {
      for (const run of agent.runs) {
        const total = run.events.reduce((ms, e) => ms + e.afterMs, 0)
        expect(total, `runs/${handle}/${run.id}.json`).toBeGreaterThanOrEqual(6_000)
        expect(total, `runs/${handle}/${run.id}.json`).toBeLessThanOrEqual(10_000)
        expect(run.events.every(e => e.afterMs > 0), `runs/${handle}/${run.id}.json`).toBe(true)
      }
    }
  })

  it('points every fallback at the prompts above the message box', async () => {
    const scripts = await loadDemoScripts(REPO_DEMO, nodeReader)
    for (const agent of Object.values(scripts.agents)) {
      expect(agent.lead.fallback.text).not.toMatch(/under the message box/i)
      expect(agent.lead.fallback.text).toMatch(/above the message box/i)
    }
  })
})

describe('checking demo scripts @SC-1983', () => {
  it('reads a valid set, filling optional fields', () => {
    const scripts = parseDemoFiles(files({ 'agents/writer.json': lead(), 'runs/writer/general.json': run('general') }))
    expect(scripts.agents.writer.lead.intents[0]).toEqual({ id: 'hello', phrasings: ['say hello'], reply: 'Hello.', toolCalls: [], voiceClip: null })
    expect(scripts.agents.writer.runs[0].files).toEqual([])
  })

  it('finds every problem at once, with where it is', () => {
    const found = problems(files({
      'agents/writer.json': lead({ agent: 'reviewer', format: 2, extra: true, voiceLines: [{ text: 'Hi', intent: 'missing' }] }),
    }))
    expect(found).toEqual(expect.arrayContaining([
      expect.stringContaining('agents/writer.json.agent'),
      expect.stringContaining('agents/writer.json.format'),
      expect.stringContaining('agents/writer.json.extra'),
      expect.stringContaining('agents/writer.json.voiceLines[0].intent: No intent missing'),
    ]))
  })

  it('refuses bad JSON, unknown files and runs of an agent with no lead script', () => {
    expect(problems(files({ 'agents/writer.json': '{ nope' }))).toContain('agents/writer.json: Not valid JSON.')
    expect(problems(files({ 'agents/writer.json': lead(), 'other/x.json': {} }))[0]).toContain('other/x.json')
    expect(problems(files({ 'agents/writer.json': lead(), 'runs/reviewer/general.json': run('general') }))[0]).toContain('No agents/reviewer.json')
  })

  it('needs at least one agent', () => {
    expect(problems(files({}))).toEqual(['agents: At least one agent\'s lead script.'])
  })

  it('needs exactly one default run per agent with runs, and one script per target', () => {
    expect(problems(files({ 'agents/writer.json': lead(), 'runs/writer/a.json': run('a', { for: { task: 'WEB-2' } }) })))
      .toEqual([expect.stringContaining('Exactly one run script is for { "default": true }')])
    expect(problems(files({ 'agents/writer.json': lead(), 'runs/writer/a.json': run('a'), 'runs/writer/b.json': run('b') })))
      .toEqual(expect.arrayContaining([expect.stringContaining('Exactly one')]))
  })

  it("refuses a run whose id is not its file's name, a result before its call, and a reused call id", () => {
    const found = problems(files({
      'agents/writer.json': lead(),
      'runs/writer/general.json': run('other', {
        events: [
          { type: 'tool_result', afterMs: 0, toolUseId: 'x', output: 'early' },
          { type: 'tool_call', afterMs: 0, toolUseId: 'y', toolName: 'Read', toolInput: {} },
          { type: 'tool_call', afterMs: 0, toolUseId: 'y', toolName: 'Read', toolInput: {} },
        ],
      }),
    }))
    expect(found).toEqual(expect.arrayContaining([
      expect.stringContaining('.id: id is the file\'s name'),
      expect.stringContaining('No tool call x before this result'),
      expect.stringContaining('The tool call y is used twice'),
    ]))
  })

  it('refuses a file path that leaves the workspace', () => {
    for (const bad of ['../out.md', '/etc/passwd', 'a/../../b', 'a\\b', 'a//b', './a', '']) {
      const found = problems(files({ 'agents/writer.json': lead(), 'runs/writer/general.json': run('general', { files: [{ path: bad, content: 'x' }] }) }))
      expect(found, bad).toEqual([expect.stringContaining('files[0].path')])
    }
  })

  it('refuses unknown event types, waits that are too long, and an unknown end', () => {
    const found = problems(files({
      'agents/writer.json': lead(),
      'runs/writer/general.json': run('general', {
        events: [{ type: 'status', afterMs: 0 }, { type: 'notice', afterMs: 60_000, notice: 'slow' }],
        end: { status: 'cancelled' },
      }),
    }))
    expect(found).toEqual(expect.arrayContaining([
      expect.stringContaining('events[0].type'), expect.stringContaining('events[1].afterMs'), expect.stringContaining('.end:'),
    ]))
  })

  it('reads every kind of end', () => {
    const endOf = (end: unknown) => parseDemoFiles(files({ 'agents/writer.json': lead(), 'runs/writer/general.json': run('general', { end }) })).agents.writer.runs[0].end
    expect(endOf({ status: 'failed', error: 'The site lost its connection.' })).toEqual({ status: 'failed', error: 'The site lost its connection.' })
    expect(endOf({ status: 'limit', limit: 'time' })).toEqual({ status: 'limit', limit: 'time' })
  })

  it('needs every named voice clip to be in voice/, and clips named safely', () => {
    const withClip = lead({ firstVoiceLine: { text: 'This is a demo voice.', voiceClip: 'writer-first.mp3' } })
    expect(problems(files({ 'agents/writer.json': withClip }))).toEqual([expect.stringContaining('No voice/writer-first.mp3')])
    expect(problems(files({ 'agents/writer.json': withClip }, ['writer-first.mp3']))).toEqual([])
    expect(problems(files({ 'agents/writer.json': lead({ fallback: { reply: 'x', voiceClip: '../x.mp3' } }) }))[0]).toContain('fallback.voiceClip')
  })

  it("needs the lead's four closing lines, each with a clip in voice/ when it names one", () => {
    const { spoken: _spoken, ...noLines } = lead()
    expect(problems(files({ 'agents/writer.json': noLines }))).toEqual([expect.stringContaining('agents/writer.json.spoken')])
    const partial = lead({ spoken: { done: { text: 'Done.' } } })
    expect(problems(files({ 'agents/writer.json': partial }))).toEqual(expect.arrayContaining([
      expect.stringContaining('spoken.workCameBack'), expect.stringContaining('spoken.refused'), expect.stringContaining('spoken.waiting'),
    ]))
    const clipped = lead({ spoken: { ...lead().spoken, done: { text: "That's started.", voiceClip: 'writer-done.mp3' } } })
    expect(problems(files({ 'agents/writer.json': clipped }))).toEqual([expect.stringContaining('spoken.done: No voice/writer-done.mp3')])
    const scripts = parseDemoFiles(files({ 'agents/writer.json': clipped }, ['writer-done.mp3']))
    expect(scripts.agents.writer.lead.spoken.done).toEqual({ text: "That's started.", voiceClip: 'writer-done.mp3' })
    expect(scripts.agents.writer.lead.spoken.refused).toEqual({ text: "That didn't go through.", voiceClip: null })
  })

  it('keeps lead tool calls opaque but shaped', () => {
    const intents = [{ id: 'make', phrasings: ['make a task'], reply: 'Made.', toolCalls: [{ toolName: 'create_task', input: { projectId: 'WEB', title: 'T' } }] }]
    const scripts = parseDemoFiles(files({ 'agents/writer.json': lead({ intents, voiceLines: [] }) }))
    expect(scripts.agents.writer.lead.intents[0].toolCalls).toEqual([{ toolName: 'create_task', input: { projectId: 'WEB', title: 'T' } }])
    const bad = [{ ...intents[0], toolCalls: [{ toolName: 'create task', input: [] }] }]
    expect(problems(files({ 'agents/writer.json': lead({ intents: bad, voiceLines: [] }) }))).toEqual([
      'agents/writer.json.intents[0].toolCalls[0].toolName: A tool name.',
      'agents/writer.json.intents[0].toolCalls[0].input: The tool input, as an object.',
    ])
  })
})
