/**
 * The memory checks (memory and Your space spec, design section 9; ADR-0188): whether a person's Rule is followed on
 * a question whose words don't name it, with the Rule weight and without; whether `remember` gets the kind and
 * `requested` the person meant; and how often a Rule needed only partway through the work is found.
 *
 * The memory block is the probe hook's own (turnBlock.ts), in the tier the probe puts the Rule in: *included* in
 * full, as the weight does with a Rule that meaning found between the bars, or *hinted* by title and key, as it was
 * before the weight. `recall` answers from the same memory (script.ts).
 */
import type { Check, Grade } from './checks'
import type { RecordedCall, RunRecord } from './run'
import { recalledFrom } from './script'
import type { CheckMemory } from './setup'
import { itemKindOf, TOOL_KINDS } from '../../server/controlplane/memoryOps'
import { TABLE_RULE } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

type Args = Record<string, unknown>
const argsOf = (c: RecordedCall): Args => (c.input && typeof c.input === 'object' ? (c.input as Args) : {})
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const said = (run: RunRecord): string => run.texts.join('\n')

/** A Markdown table: a row of cells, then its divider row. */
const TABLE = /^[^\n]*\|[^\n]*\n[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/m
export const hasTable = (text: string): boolean => TABLE.test(text)

/** A `recall` whose answer held the Rule. */
const recalledRule = (run: RunRecord): boolean =>
  run.calls.some(c => c.name === 'recall' && recalledFrom(argsOf(c), [TABLE_RULE]).length > 0)

const ruleShown = (shown: CheckMemory['shown']): CheckMemory => ({ items: [TABLE_RULE], shown })

/** The question whose words don't name the Rule (spec decision 10). */
export const HOST_QUESTION = 'Which host should we pick for the shop: Fly, Render or a VPS?'

const WEIGHT_ARMS = {
  included: { id: 'rule-weight-included', words: 'included in full' },
  hinted: { id: 'rule-weight-hinted', words: 'only in the hint' },
  none: { id: 'rule-weight-none', words: 'held but not shown, as the probe scores this question' },
} as const

function ruleWeight(shown: CheckMemory['shown']): Check {
  // Recalling is what a hint asks for, and the one way to the Rule when nothing shows it.
  const recallCounts = shown !== 'included'
  return {
    id: WEIGHT_ARMS[shown].id,
    title: `The Rule weight: the table rule ${WEIGHT_ARMS[shown].words}`,
    setup: { home: 'project', message: HOST_QUESTION, memory: ruleShown(shown) },
    grade(run) {
      if (run.answer === null) return fail(`no answer within the rounds: ${calls(run)}`)
      if (hasTable(said(run))) return PASS
      if (recallCounts && recalledRule(run)) return PASS
      return fail(`compared without a table${recallCounts ? ' and without recalling the rule' : ''}: ${said(run).slice(0, 200)}`)
    },
  }
}

/** The memory `remember` would save, as the real tool reads its arguments (leadMemoryTools.ts). */
function saved(c: RecordedCall): { kind: 'FACT' | 'RULE' | null; requested: boolean } {
  const a = argsOf(c)
  const kind = TOOL_KINDS.find(k => k === a.kind)
  return { kind: kind ? itemKindOf(kind) : null, requested: a.requested === true || a.correction === true }
}

const inWords = (s: ReturnType<typeof saved>) => `${s.kind ?? 'no kind'}${s.requested ? ', requested' : ''}`

function rememberedAs(id: string, title: string, message: string, kind: 'FACT' | 'RULE', requested: boolean, home: 'project' | 'your-space' = 'project'): Check {
  return {
    id,
    title,
    setup: { home, message },
    grade(run) {
      const saves = run.calls.filter(c => c.name === 'remember').map(saved)
      if (saves.length === 0) return requested ? fail(`nothing remembered: ${calls(run)}`) : PASS
      const wrong = saves.find(s => s.kind !== kind || s.requested !== requested)
      return wrong ? fail(`remembered as ${inWords(wrong)}, not ${inWords({ kind, requested })}`) : PASS
    },
  }
}

/**
 * "Remember that …" is a request to keep it, so `remember` is called in that reply, of any kind, with `requested` true.
 * One call of a model is a draw: the check runs ten times and is met at 9 of 10.
 */
const REMEMBER_THAT: Check = {
  id: 'remember-that',
  title: 'A "remember that" asked, called as remember: a rate',
  runs: 10,
  minPassRate: 0.9,
  setup: { home: 'project', message: 'Remember that our release day is Thursday.' },
  grade(run) {
    const saves = run.calls.filter(c => c.name === 'remember').map(saved)
    if (saves.length === 0) return fail(`remember not called: ${calls(run)}`)
    return saves.some(s => s.requested) ? PASS : fail('remember called without requested true')
  },
}

/** The person asks for a comparison through work whose first step does not need the Rule. */
export const QUOTES_IN_KNOWLEDGE = 'Look at the hosting quotes in our Knowledge and tell me which one to take.'
export const QUOTES_IN_FILES = 'Look at our three hosting quotes in Files and tell me which to take.'

export const MEMORY_CHECKS: readonly Check[] = [
  ruleWeight('included'),
  ruleWeight('hinted'),
  ruleWeight('none'),
  rememberedAs('remember-rule-asked', 'A standing instruction, asked to be kept', 'Always answer me in British English.', 'RULE', true),
  REMEMBER_THAT,
  rememberedAs('remember-fact-asked', 'A fact, asked to be kept', 'Remember that my partner is called Sam.', 'FACT', true),
  rememberedAs(
    'remember-fact-in-passing',
    'A fact said in passing, if kept at all',
    "Can you plan a dinner for four this Saturday? I'm vegetarian, by the way.",
    'FACT', false, 'your-space',
  ),
  {
    id: 'rule-mid-work',
    title: 'A Rule met mid-work: the quotes read, then compared',
    setup: { home: 'project', message: QUOTES_IN_KNOWLEDGE, memory: ruleShown('hinted') },
    grade(run) {
      if (hasTable(said(run)) || recalledRule(run)) return PASS
      if (run.answer === null) return fail(`no answer within the rounds: ${calls(run)}`)
      return fail(`compared without a table and without recalling the rule: ${calls(run)}; ${said(run).slice(0, 200)}`)
    },
  },
  {
    // The lead reads no Files: the work does, and the brief is all it is told of what the lead recalled.
    id: 'rule-mid-work-files',
    title: 'A Rule met mid-work in the background: the brief carries it',
    setup: { home: 'project', message: QUOTES_IN_FILES, memory: ruleShown('hinted') },
    grade(run) {
      const started = run.calls.find(c => c.name === 'start_work' || c.name === 'create_task')
      if (!started) return fail(`no work started: ${calls(run)}`)
      const a = argsOf(started)
      const brief = [a.brief, a.description, a.title].filter((v): v is string => typeof v === 'string').join(' ')
      return /\btable\b/i.test(brief) ? PASS : fail(`the brief does not carry the rule${recalledRule(run) ? ' (recalled, not passed on)' : ''}: ${brief.slice(0, 200)}`)
    },
  },
]
