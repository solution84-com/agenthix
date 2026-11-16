/**
 * Tools found by search: a `use_tool` call is graded as the tool it names, `find_tools` as itself, and the first
 * request is measured from the provider's own count. On a fake model, in the lead's, a task run's and the skills runs.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest, LeadStreamEvent, ModelAdapter, TurnUsage } from '../../contract'
import { anthropicAccess } from '../../model/testSupport'
import { runSkillsCheck } from '../../../assets/proposals/__modelchecks__/skillsRun'
import { runSkillsChecks } from '../../../assets/proposals/__modelchecks__/skillsRunner'
import { SKILL_CHECKS } from '../../../assets/proposals/__modelchecks__/skillChecks'
import { CHECKS, type Check } from '../checks'
import { findToolsAnswer, readCall } from '../readCall'
import { allPassed, firstRequestSection, report, summaryTable } from '../report'
import { runCheck } from '../run'
import { runModelChecks } from '../runner'
import type { CheckSetup } from '../setup'
import { runTaskRunCheck } from '../taskRun/run'

type Round = { name: string; input: unknown }[]
const usage = (inputTokens: number, cacheReadTokens = 0, cacheWriteTokens = 0): TurnUsage => ({ inputTokens, outputTokens: 5, cacheReadTokens, cacheWriteTokens })

/** A model that makes these calls round by round, then answers; each round reports `tokens[round]` of input. */
function fake(rounds: Round[], tokens: TurnUsage[] = []): ModelAdapter & { seen: LeadRequest[] } {
  const seen: LeadRequest[] = []
  return {
    seen,
    async *stream(request: LeadRequest): AsyncIterable<LeadStreamEvent> {
      const at = seen.push(request) - 1
      const calls = rounds[at] ?? []
      if (calls.length === 0) yield { type: 'text', text: 'Done.' }
      for (const [i, c] of calls.entries()) yield { type: 'tool-call', call: { id: `c${at}-${i}`, ...c } }
      yield { type: 'finish', reason: calls.length ? 'tool-calls' : 'stop', usage: tokens[at] ?? usage(0) }
    },
    complete: async () => { throw new Error('not used') },
  }
}

const lead = (id: string) => CHECKS.find(c => c.id === id) as Check & { setup: CheckSetup }
const remember = { title: 'Release day', body: 'Thursday', requested: true, kind: 'fact', scope: 'place' }
const env = { MODEL_CHECK_PROVIDER: 'anthropic', MODEL_CHECK_MODELS: 'small', MODEL_CHECK_API_KEY: 'k' }

describe('readCall', () => {
  it('reads use_tool as the tool it names, and anything else as itself', () => {
    expect(readCall('use_tool', { name: 'remember', input: remember })).toEqual({ name: 'remember', input: remember })
    expect(readCall('use_tool', { name: 'recall' })).toEqual({ name: 'recall', input: {} })
    expect(readCall('find_tools', { query: 'remember' })).toEqual({ name: 'find_tools', input: { query: 'remember' } })
    expect(readCall('use_tool', { input: {} })).toEqual({ name: 'use_tool', input: { input: {} } })
  })

  it('finds the offered tools whose words match, and none for words that match nothing', () => {
    const offered = [{ name: 'remember', description: 'Keep something the person said' }, { name: 'list_tasks', description: 'List the tasks' }]
    expect(findToolsAnswer({ query: 'keep a memory' }, offered)).toEqual({ tools: [{ name: 'remember', description: 'Keep something the person said' }] })
    expect(findToolsAnswer({ query: 'zzz' }, offered)).toMatchObject({ tools: [] })
  })
})

describe('a use_tool call in a run', () => {
  it('grades as the tool it names in the lead, and answers as that tool would', async () => {
    const model = fake([[{ name: 'use_tool', input: { name: 'remember', input: remember } }], []])
    const run = await runCheck(model, anthropicAccess, lead('remember-that').setup)
    expect(run.calls.map(c => c.name)).toEqual(['remember'])
    expect(lead('remember-that').grade(run)).toEqual({ passed: true })
    const answered = (model.seen[1]!.messages.at(-1) as { result: { status: string } }).result
    expect(answered).toMatchObject({ status: 'added', requested: true })
  })

  it('records find_tools as itself and answers it from the offered tools', async () => {
    const model = fake([[{ name: 'find_tools', input: { query: 'remember something' } }], []])
    const run = await runCheck(model, anthropicAccess, lead('remember-that').setup)
    expect(run.calls.map(c => c.name)).toEqual(['find_tools'])
    expect(JSON.stringify((model.seen[1]!.messages.at(-1) as { result: unknown }).result)).toContain('remember')
    expect(lead('remember-that').grade(run)).toMatchObject({ passed: false })
  })

  it('grades as the tool it names in a task run and in a skills run', async () => {
    const task = CHECKS.find(c => c.id === 'taskrun-no-preview-asked') as Check & { taskRun: NonNullable<Check['taskRun']> }
    const run = await runTaskRunCheck(fake([[{ name: 'use_tool', input: { name: 'start_app', input: { name: 'shop' } } }], []]), anthropicAccess, task.taskRun)
    expect(run.calls).toMatchObject([{ name: 'start_app', input: { name: 'shop' } }])
    const skill = SKILL_CHECKS.find(c => c.id === 'skill-use')!
    const loaded = await runSkillsCheck(fake([[{ name: 'use_tool', input: { name: 'skill', input: { name: 'org-release-notes' } } }], []]), anthropicAccess, skill.ask)
    expect(skill.grade(loaded)).toEqual({ passed: true })
  })
})

describe('remember-that', () => {
  it('runs ten times, in place of MODEL_CHECK_RUNS, and is met at 9 of 10', async () => {
    // A run's first call (the request holds no tool answer yet) makes the call, except in the fourth run; a later one answers.
    let run = 0
    const adapter: ModelAdapter = {
      async *stream(request) {
        const first = !request.messages.some(m => m.role === 'tool')
        if (first) run++
        if (first && run !== 4) yield { type: 'tool-call', call: { id: 'c', name: 'remember', input: remember } }
        else yield { type: 'text', text: 'Done.' }
        yield { type: 'finish', reason: 'stop', usage: usage(0) }
      },
      complete: async () => { throw new Error('not used') },
    }
    const result = await runModelChecks({ ...env, MODEL_CHECK_RUNS: '1' }, { adapter, out: () => {} }, [lead('remember-that')])
    if ('skipped' in result) throw new Error('not run')
    expect(result.outcomes).toHaveLength(10)
    expect(summaryTable(result.outcomes, result.checks, result.models)).toContain('| remember-that | passes 9/10 |')
    expect(allPassed(result.outcomes)).toBe(true)
    const worse = result.outcomes.map((o, i) => (i < 2 ? { ...o, grade: { passed: false as const, why: 'x' } } : o))
    expect(allPassed(worse)).toBe(false)
    expect(summaryTable(worse, result.checks, result.models)).toContain('| remember-that | fails 7/10 |')
  })

  it('passes a remember with requested, fails one without it or none at all', async () => {
    const graded = async (rounds: Round[]) => lead('remember-that').grade(await runCheck(fake(rounds), anthropicAccess, lead('remember-that').setup))
    expect(await graded([[{ name: 'remember', input: { ...remember, kind: 'rule' } }], []])).toEqual({ passed: true })
    expect(await graded([[{ name: 'remember', input: { ...remember, requested: false } }], []])).toMatchObject({ passed: false })
    expect(await graded([[]])).toMatchObject({ passed: false, why: expect.stringContaining('remember not called') })
  })
})

describe('the first request, tokens', () => {
  it("is the first call's input in full, cache reads and writes included, and the report names the median per check", async () => {
    const model = fake([[{ name: 'list_agents', input: {} }], []], [usage(100, 2000, 300), usage(50)])
    const run = await runCheck(model, anthropicAccess, lead('in-reach').setup)
    expect(run.firstRequestTokens).toBe(2400)

    let n = 0
    const adapter: ModelAdapter = {
      async *stream() {
        yield { type: 'text', text: 'Fridays.' }
        yield { type: 'finish', reason: 'stop', usage: usage([1000, 3000, 2000][n++ % 3]!) }
      },
      complete: async () => { throw new Error('not used') },
    }
    const result = await runModelChecks({ ...env, MODEL_CHECK_RUNS: '3' }, { adapter, out: () => {} }, [lead('in-reach')])
    if ('skipped' in result) throw new Error('not run')
    expect(result.outcomes.map(o => o.firstRequestTokens)).toEqual([1000, 3000, 2000])
    const text = report(result.outcomes, result.checks, result.models, new Date(0))
    expect(text).toContain('## First request, tokens')
    expect(text).toContain("| The lead's checks | small |")
    expect(text).toContain('| in-reach | 2000 |')
  })

  it('is measured in the task-run and skills runs too, and the section is empty without a count', async () => {
    const task = CHECKS.find(c => c.id === 'taskrun-no-preview-asked') as Check & { taskRun: NonNullable<Check['taskRun']> }
    expect((await runTaskRunCheck(fake([[]], [usage(700, 100)]), anthropicAccess, task.taskRun)).firstRequestTokens).toBe(800)
    const skillCheck = SKILL_CHECKS.find(c => c.id === 'skill-what-can-you-do')!
    const result = await runSkillsChecks({ ...env, MODEL_CHECK_RUNS: '1' }, { adapter: fake([[]], [usage(900)]), out: () => {} }, [skillCheck])
    if ('skipped' in result) throw new Error('not run')
    expect(firstRequestSection(result.outcomes, result.models).join('\n')).toContain('| The skills checks | small |\n|---|---|\n| skill-what-can-you-do | 900 |')
    expect(firstRequestSection([{ model: 'm', check: 'c', run: 1, grade: { passed: true }, kind: 'lead' }], ['m'])).toEqual([])
  })
})
