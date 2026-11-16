/**
 * The memory checks on a fake model and on runs written by hand: the probe's block reaches the turn in the tier the
 * check names, `recall` answers from the same memory, and the graders pass and fail what they should. No model is
 * called; the checks themselves run on the baseline with `npm run test:models` (README.md beside them).
 */
import { describe, expect, it } from 'vitest'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { createModelAdapter } from '../../model'
import { anthropicAccess, textChunks, usageOf } from '../../model/testSupport'
import { CHECKS, type Check } from '../checks'
import { MEMORY_CHECKS, hasTable } from '../memoryChecks'
import { runCheck, type RunRecord } from '../run'
import type { CheckSetup } from '../setup'
import { HOSTING_PAGE, TABLE_RULE } from '../world'

type Step = { calls?: { name: string; input: unknown }[]; text?: string }

/** A model that takes the steps given, one per call, and keeps every request it was sent. */
function scripted(steps: Step[]) {
  const prompts: unknown[] = []
  let at = 0
  const model = new MockLanguageModelV3({
    doStream: async options => {
      prompts.push(options.prompt)
      const step = steps[Math.min(at++, steps.length - 1)]!
      const chunks: LanguageModelV3StreamPart[] = step.calls
        ? [
            { type: 'stream-start', warnings: [] },
            ...step.calls.map((c, i) => ({ type: 'tool-call' as const, toolCallId: `call-${i}`, toolName: c.name, input: JSON.stringify(c.input) })),
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: usageOf({ total: 4 }, 2) },
          ]
        : textChunks([step.text ?? ''])
      return { stream: convertArrayToReadableStream<LanguageModelV3StreamPart>(chunks) }
    },
  })
  return { adapter: createModelAdapter({ languageModel: () => model, record: () => {}, maxRetries: 0 }), prompts }
}

const check = (id: string) => MEMORY_CHECKS.find(c => c.id === id) as Check & { setup: CheckSetup }
const run = (texts: string[], ...calls: Array<[name: string, input: Record<string, unknown>]>): RunRecord => ({
  calls: calls.map(([name, input], round) => ({ round, name, input })), texts, answer: texts.at(-1) ?? null,
})

const TABLE = '| Host | Cost | Risk |\n|---|---|---|\n| Fly | 85 | new to us |\n| Render | 120 | low |'

describe('the memory checks', () => {
  it('are among the checks the runner runs', () => {
    expect(CHECKS.map(c => c.id)).toEqual(expect.arrayContaining(MEMORY_CHECKS.map(c => c.id)))
  })

  it('send the Rule in full with the weight, and by title and key without it', async () => {
    const included = scripted([{ text: 'Render.' }])
    await runCheck(included.adapter, anthropicAccess, check('rule-weight-included').setup)
    const withWeight = JSON.stringify(included.prompts[0])
    expect(withWeight).toContain(`[${TABLE_RULE.key}] Rule — ${TABLE_RULE.title}: ${TABLE_RULE.body}`)

    const hinted = scripted([{ text: 'Render.' }])
    await runCheck(hinted.adapter, anthropicAccess, check('rule-weight-hinted').setup)
    const withoutWeight = JSON.stringify(hinted.prompts[0])
    expect(withoutWeight).toContain(`Possibly relevant (recall by key to read): ${TABLE_RULE.title} [${TABLE_RULE.key}]`)
    expect(withoutWeight).not.toContain(TABLE_RULE.body)
  })

  it('answer recall from the same memory, in the real tool\'s shape', async () => {
    const fake = scripted([{ calls: [{ name: 'recall', input: { key: TABLE_RULE.key } }] }, { text: 'Render.' }])
    const record = await runCheck(fake.adapter, anthropicAccess, check('rule-weight-hinted').setup)
    const second = JSON.stringify(fake.prompts[1])
    expect(second).toContain(TABLE_RULE.body.slice(0, 40))
    expect(second).toContain('"kind":"rule"')
    expect(check('rule-weight-hinted').grade(record)).toEqual({ passed: true })
  })

  it('find the hosting quotes page by its words, and leave other searches as they were', async () => {
    const fake = scripted([{ calls: [{ name: 'search_knowledge', input: { pattern: 'hosting quote' } }] }, { text: TABLE }])
    const record = await runCheck(fake.adapter, anthropicAccess, check('rule-mid-work').setup)
    expect(JSON.stringify(fake.prompts[1])).toContain(`${HOSTING_PAGE}:6: ## Fly.io`)
    expect(check('rule-mid-work').grade(record)).toEqual({ passed: true })

    const other = scripted([{ calls: [{ name: 'search_knowledge', input: { pattern: 'release' } }] }, { text: 'Done.' }])
    await runCheck(other.adapter, anthropicAccess, check('rule-mid-work').setup)
    expect(JSON.stringify(other.prompts[1])).not.toContain(HOSTING_PAGE)
  })

  it('tell a Markdown table from a list or a line with a bar in it', () => {
    expect(hasTable(`Here:\n\n${TABLE}\n\nTake Render.`)).toBe(true)
    expect(hasTable('|Host|Cost|\n|:--|--:|\n|Fly|85|')).toBe(true)
    expect(hasTable('- Fly: 85\n- Render: 120')).toBe(false)
    expect(hasTable('Cost | risk: Render wins.')).toBe(false)
  })

  it('pass the weighted Rule followed, and fail it passed by', () => {
    const c = check('rule-weight-included')
    expect(c.grade(run([TABLE]))).toEqual({ passed: true })
    expect(c.grade(run(['Pick Render: it is the safest.'])).passed).toBe(false)
    // With the Rule in full, recalling it is not enough: the table is the rule.
    expect(c.grade(run(['', 'Pick Render.'], ['recall', { key: TABLE_RULE.key }])).passed).toBe(false)
  })

  it('pass the hinted Rule recalled or followed, and fail a recall that cannot find it', () => {
    const c = check('rule-weight-hinted')
    expect(c.grade(run(['', 'Pick Render.'], ['recall', { key: TABLE_RULE.key }])).passed).toBe(true)
    expect(c.grade(run(['', 'Pick Render.'], ['recall', { kind: 'rule' }])).passed).toBe(true)
    expect(c.grade(run(['', 'Pick Render.'], ['recall', { kind: 'fact' }])).passed).toBe(false)
    expect(c.grade(run([TABLE])).passed).toBe(true)
  })

  it('send no memory when the probe scored the Rule below the bars, and still let recall find it', async () => {
    const fake = scripted([{ calls: [{ name: 'recall', input: { kind: 'rule' } }] }, { text: 'Render.' }])
    const record = await runCheck(fake.adapter, anthropicAccess, check('rule-weight-none').setup)
    expect(JSON.stringify(fake.prompts[0])).not.toContain('[Memory for this reply')
    expect(check('rule-weight-none').grade(record)).toEqual({ passed: true })
    expect(check('rule-weight-none').grade(run(['Pick Render.'])).passed).toBe(false)
  })

  it('pass a standing instruction saved as a requested Rule, deprecated kinds read as the tool reads them', () => {
    const c = check('remember-rule-asked')
    const base = { title: 'British English', body: 'Always answer in British English.' }
    expect(c.grade(run(['Noted.'], ['remember', { ...base, kind: 'rule', requested: true }]))).toEqual({ passed: true })
    expect(c.grade(run(['Noted.'], ['remember', { ...base, kind: 'preference', requested: true }]))).toEqual({ passed: true })
    expect(c.grade(run(['Noted.'], ['remember', { ...base, kind: 'fact', requested: true }]))).toEqual({ passed: false, why: 'remembered as FACT, requested, not RULE, requested' })
    expect(c.grade(run(['Noted.'], ['remember', { ...base, kind: 'rule' }]))).toEqual({ passed: false, why: 'remembered as RULE, not RULE, requested' })
    expect(c.grade(run(['Noted.'])).passed).toBe(false)
  })

  it('pass a fact asked to be kept as a requested Fact', () => {
    const c = check('remember-fact-asked')
    expect(c.grade(run(['Noted.'], ['remember', { title: 'Partner', body: 'Partner is Sam.', kind: 'fact', requested: true }]))).toEqual({ passed: true })
    expect(c.grade(run(['Noted.'], ['remember', { title: 'Partner', body: 'Partner is Sam.', kind: 'fact' }])).passed).toBe(false)
  })

  it('pass a fact said in passing left alone or kept unrequested, and fail it marked requested', () => {
    const c = check('remember-fact-in-passing')
    expect(c.setup.home).toBe('your-space')
    expect(c.grade(run(['A menu.']))).toEqual({ passed: true })
    expect(c.grade(run(['A menu.'], ['remember', { title: 'Vegetarian', body: 'Is vegetarian.', kind: 'fact' }]))).toEqual({ passed: true })
    expect(c.grade(run(['A menu.'], ['remember', { title: 'Vegetarian', body: 'Is vegetarian.' }]))).toEqual({ passed: true })
    expect(c.grade(run(['A menu.'], ['remember', { title: 'Vegetarian', body: 'Is vegetarian.', kind: 'diet' }])).passed).toBe(false)
    expect(c.grade(run(['A menu.'], ['remember', { title: 'Vegetarian', body: 'Is vegetarian.', kind: 'fact', requested: true }])).passed).toBe(false)
    expect(c.grade(run(['A menu.'], ['remember', { title: 'No meat', body: 'Never suggest meat.', kind: 'rule' }])).passed).toBe(false)
  })

  it('pass a Rule met mid-work recalled or followed, and fail a comparison without either', () => {
    const c = check('rule-mid-work')
    expect(c.grade(run(['', TABLE], ['read_knowledge', { page: HOSTING_PAGE }]))).toEqual({ passed: true })
    expect(c.grade(run(['', '', 'Render.'], ['read_knowledge', { page: HOSTING_PAGE }], ['recall', { query: 'how to compare' }])).passed).toBe(true)
    expect(c.grade(run(['', 'Take Render: it never went down.'], ['read_knowledge', { page: HOSTING_PAGE }])).passed).toBe(false)
  })

  it('pass background work whose brief carries the Rule, and fail one that drops it', () => {
    const c = check('rule-mid-work-files')
    const brief = 'Read the three hosting quotes in Files and compare them in a table, one row per quote, cost and risk.'
    expect(c.grade(run(["I'm reading them now."], ['start_work', { boundary: 'WEB', brief }]))).toEqual({ passed: true })
    const dropped = c.grade(run(['', "I'm reading them now."], ['recall', { key: TABLE_RULE.key }], ['start_work', { boundary: 'WEB', brief: 'Read the quotes and pick one.' }]))
    expect(dropped).toMatchObject({ passed: false, why: expect.stringContaining('recalled, not passed on') })
    expect(c.grade(run(['Which files?'])).passed).toBe(false)
  })
})
