/**
 * The model checks' own harness, on a fake model: the real context and tools go out, the script answers, and the
 * grading passes the right calls and fails the wrong ones. With no environment, nothing is called.
 */
import { describe, expect, it } from 'vitest'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { createModelAdapter } from '../../model'
import { anthropicAccess, textChunks, usageOf } from '../../model/testSupport'
import type { ModelAdapter } from '../../contract'
import { CHECKS } from '../checks'
import { runCheck } from '../run'
import { runModelChecks } from '../runner'
import { SKIP_LINE, checkAccess } from '../env'
import { summaryTable } from '../report'
import { PROJECT, RELEASE_PAGE } from '../world'

type Step = { calls?: { name: string; input: unknown }[]; text?: string }

function callChunks(calls: NonNullable<Step['calls']>): LanguageModelV3StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    ...calls.map((c, i) => ({ type: 'tool-call' as const, toolCallId: `call-${i}`, toolName: c.name, input: JSON.stringify(c.input) })),
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: usageOf({ total: 4 }, 2) },
  ]
}

/** A model that takes the steps given, one per call, and keeps every request it was sent. */
function scripted(steps: Step[]) {
  const prompts: unknown[] = []
  const toolNames: string[][] = []
  let at = 0
  const model = new MockLanguageModelV3({
    doStream: async options => {
      prompts.push(options.prompt)
      toolNames.push((options.tools ?? []).map(t => t.name))
      const step = steps[Math.min(at++, steps.length - 1)]!
      const chunks = step.calls ? callChunks(step.calls) : textChunks([step.text ?? ''])
      return { stream: convertArrayToReadableStream<LanguageModelV3StreamPart>(chunks) }
    },
  })
  const adapter = createModelAdapter({ languageModel: () => model, record: () => {}, maxRetries: 0 })
  return { adapter, prompts, toolNames, calls: () => at }
}

const check = (id: string) => CHECKS.find(c => c.id === id)!

describe('the model checks', () => {
  it('send the lead its real instructions, places block and tools @SC-1445', async () => {
    const fake = scripted([{ text: 'Done.' }])
    await runCheck(fake.adapter, anthropicAccess, check('my-space').setup)
    const sent = JSON.stringify(fake.prompts[0])
    expect(sent).toMatch(/You are Kernel/)
    expect(sent).toContain("[This conversation's places, checked this turn]")
    expect(sent).toContain(`${PROJECT.name} (its pages are named ${PROJECT.slug}:)`)
    expect(sent).toContain('Look through the files in my space.')
    expect(fake.toolNames[0]).toEqual(expect.arrayContaining(['search_knowledge', 'read_knowledge', 'edit_knowledge', 'suggest_place', 'list_projects', 'start_work', 'remember']))
  })

  it('pass a guide question searched in the guide before the answer @SC-1446', async () => {
    const fake = scripted([
      { calls: [{ name: 'search_knowledge', input: { pattern: 'API key', scope: 'platform' } }] },
      { text: 'Open Manage, then Providers.' },
    ])
    const run = await runCheck(fake.adapter, anthropicAccess, check('guide-model-key').setup)
    expect(check('guide-model-key').grade(run)).toEqual({ passed: true })
    // The second call carried the script's answer from the guide.
    expect(JSON.stringify(fake.prompts[1])).toContain('platform:your-tools/providers.md:8:')
  })

  it('fail a guide question asked back to the person @SC-1446', async () => {
    const fake = scripted([{ text: 'Which model provider do you mean?' }])
    const run = await runCheck(fake.adapter, anthropicAccess, check('guide-voice').setup)
    expect(check('guide-voice').grade(run)).toEqual({ passed: false, why: 'asked the person back without searching' })
  })

  it('pass my space offered with suggest_place, and fail it swapped for the project @SC-1446', async () => {
    const right = scripted([{ calls: [{ name: 'suggest_place', input: { place: 'Your space', why: 'To look through your files.' } }] }, { text: 'Add it?' }])
    expect(check('my-space').grade(await runCheck(right.adapter, anthropicAccess, check('my-space').setup))).toEqual({ passed: true })
    const wrong = scripted([{ calls: [{ name: 'start_work', input: { boundary: PROJECT.key, brief: 'List the files.' } }] }])
    const graded = check('my-space').grade(await runCheck(wrong.adapter, anthropicAccess, check('my-space').setup))
    expect(graded).toEqual({ passed: false, why: `used the conversation's project instead: start_work(boundary=${PROJECT.key})` })
  })

  it('pass a place outside the conversation offered by its name @SC-1446', async () => {
    const fake = scripted([
      { calls: [{ name: 'search_knowledge', input: { pattern: 'release', scope: PROJECT.slug } }] },
      { calls: [{ name: 'suggest_place', input: { place: PROJECT.slug, why: 'Its release process is there.' } }] },
      { text: 'I can add it.' },
    ])
    const run = await runCheck(fake.adapter, anthropicAccess, check('place-outside').setup)
    expect(check('place-outside').grade(run)).toEqual({ passed: true })
    expect(JSON.stringify(fake.prompts[1])).toContain('is not among this conversation')
  })

  it('pass a correction made to the page, and fail one also remembered @SC-1446', async () => {
    const edit = { name: 'edit_knowledge', input: { page: RELEASE_PAGE, old_string: 'after the checks pass', new_string: "after the checks pass and Mia's approval before 4pm" } }
    const right = scripted([{ calls: [edit] }, { text: 'Updated.' }])
    expect(check('correction').grade(await runCheck(right.adapter, anthropicAccess, check('correction').setup))).toEqual({ passed: true })
    const remembered = scripted([{ calls: [edit, { name: 'remember', input: { scope: 'place', title: 'Staging', body: 'Mia approves', kind: 'fact' } }] }, { text: 'Updated.' }])
    const graded = check('correction').grade(await runCheck(remembered.adapter, anthropicAccess, check('correction').setup))
    expect(graded.passed).toBe(false)
    expect(graded).toMatchObject({ why: expect.stringMatching(/^called remember/) })
  })

  it('fail an in-reach question answered from nothing @SC-1446', async () => {
    const fake = scripted([{ text: 'Releases go out on Fridays.' }])
    const run = await runCheck(fake.adapter, anthropicAccess, check('in-reach').setup)
    expect(check('in-reach').grade(run)).toEqual({ passed: false, why: 'answered without searching' })
  })

  it('skip every check with one line, and call nothing, without the environment @SC-1445', async () => {
    const stream = () => { throw new Error('a model was called') }
    const adapter: ModelAdapter = { stream, complete: stream }
    const lines: string[] = []
    expect(await runModelChecks({}, { adapter, out: l => lines.push(l) })).toEqual({ skipped: SKIP_LINE })
    expect(lines).toEqual([SKIP_LINE])
    expect(checkAccess({ MODEL_CHECK_PROVIDER: 'openai_compatible', MODEL_CHECK_MODELS: 'm', MODEL_CHECK_API_KEY: 'k' })).toEqual({ skip: SKIP_LINE })
  })

  it('pass a check for a model only when every run does, and never show the key @SC-1445', async () => {
    const env = { MODEL_CHECK_PROVIDER: 'anthropic', MODEL_CHECK_MODELS: 'small', MODEL_CHECK_API_KEY: 'sk-secret-1', MODEL_CHECK_RUNS: '2' }
    let at = 0
    const adapter: ModelAdapter = {
      async *stream() {
        if (at++ === 0) throw new Error('refused key sk-secret-1')
        yield { type: 'text', text: 'Fridays.' }
      },
      complete: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    }
    const lines: string[] = []
    const result = await runModelChecks(env, { adapter, out: l => lines.push(l) }, [check('in-reach')])
    expect(lines).toEqual([
      'small · in-reach · run 1: failed: the model call failed: refused key [key]',
      'small · in-reach · run 2: failed: answered without searching',
    ])
    if ('skipped' in result) throw new Error('not run')
    expect(summaryTable(result.outcomes, result.checks, result.models)).toBe('| Check | small |\n|---|---|\n| in-reach | fails (0/2) |')
  })
})
