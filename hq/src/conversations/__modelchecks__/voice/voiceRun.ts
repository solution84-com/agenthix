/**
 * Runs the three voice sets on every model the environment names (env.ts): the light model's eight moments and two
 * paced pauses through hq's listening call, the lead's scenario library through the lead path Live uses, and the hum
 * set's tellings through the hum service's call, `MODEL_CHECK_RUNS` times. The model is a parameter of the run:
 * `MODEL_CHECK_MODELS`, the baseline DeepSeek Flash on OpenRouter. `MODEL_CHECK_VOICE_SETS` names the sets to run
 * (`light`, `lead`, `hum`, comma-separated; unset, all). Without the environment nothing is called.
 * Calls run one scenario at a time for the light set (as Live meets them), a few at once for the library, and one
 * telling at a time for the hum set, each call timed.
 */
import type { ModelAdapter } from '../../contract'
import { checkAccess } from '../env'
import { createModelAdapter } from '../../model'
import { ALL_SCENARIOS, SCENARIO_GROUPS } from './leadSet'
import { runLeadScenario } from './leadSet/run'
import { runLightScenario } from './lightSet/run'
import { PACED_SCENARIOS, runPacedScenario } from './lightSet/paced'
import { LIGHT_SCENARIOS } from './lightSet/scenarios'
import type { LightScenarioResult, ScenarioResult } from './types'
import { TELLINGS } from './humSet/tellings'
import { humSummary, runHumTelling, type HumTellingResult } from './humSet/run'

/** Library calls in flight at once, per model. */
export const LEAD_CONCURRENCY = 4

export interface VoiceRunDeps {
  /** The real adapter unless set; tests give one on a fake model. */
  adapter?: ModelAdapter
  out(line: string): void
}

export interface ModelScores { model: string; light: LightScenarioResult[]; lead: ScenarioResult[]; hum: HumTellingResult[] }

export type VoiceSet = 'light' | 'lead' | 'hum'

/** The sets `MODEL_CHECK_VOICE_SETS` names; unset, all three. */
export function voiceSets(env: Readonly<Record<string, string | undefined>>): ReadonlySet<VoiceSet> {
  const named = (env.MODEL_CHECK_VOICE_SETS ?? '').split(',').map(s => s.trim()).filter((s): s is VoiceSet => ['light', 'lead', 'hum'].includes(s))
  return new Set(named.length ? named : ['light', 'lead', 'hum'])
}
export type VoiceRunResult = { skipped: string } | { scores: ModelScores[] }

export async function runVoiceChecks(env: Readonly<Record<string, string | undefined>>, deps: VoiceRunDeps): Promise<VoiceRunResult> {
  const access = checkAccess(env)
  if ('skip' in access) {
    deps.out(access.skip)
    return { skipped: access.skip }
  }
  // No ledger row and no provider health: these calls are no one's and change nothing in HQ.
  const adapter = deps.adapter ?? createModelAdapter({ record: () => {}, maxRetries: 2 })
  const scores: ModelScores[] = []
  const sets = voiceSets(env)
  for (const model of access.accesses) {
    const redact = (line: string) => line.split(model.apiKey).join('[key]')
    const light: LightScenarioResult[] = []
    const tell = (r: LightScenarioResult) => {
      light.push(r)
      deps.out(redact(`${model.model} · light · ${r.scenarioId}: ${r.pass ? 'passed' : `failed: ${failedWhy(r) || 'a step is missing'}`}`))
    }
    if (sets.has('light')) {
      for (const scenario of LIGHT_SCENARIOS) tell(await runLightScenario(scenario, adapter, model))
      for (const scenario of PACED_SCENARIOS) tell(await runPacedScenario(scenario, adapter, model))
    }
    const hum: HumTellingResult[] = []
    if (sets.has('hum')) {
      for (let run = 0; run < access.runs; run++) for (const telling of TELLINGS) hum.push(await runHumTelling(telling, adapter, model))
      const h = humSummary(hum)
      deps.out(`${model.model} · hum: kind ${h.right}/${h.points} (${h.near} near), tone ${h.toneRight}/${h.toned}, median ${h.medianMs} ms, 90th ${h.p90Ms} ms`)
    }
    const lead: ScenarioResult[] = []
    let next = 0
    const lane = async () => {
      while (sets.has('lead') && next < ALL_SCENARIOS.length) {
        const scenario = ALL_SCENARIOS[next++]!
        const r = await runLeadScenario(scenario, adapter, model)
        r.error &&= redact(r.error)
        lead.push(r)
      }
    }
    await Promise.all(Array.from({ length: LEAD_CONCURRENCY }, lane))
    for (const g of SCENARIO_GROUPS) {
      const mine = lead.filter(r => g.scenarios.some(s => s.id === r.scenarioId))
      deps.out(`${model.model} · lead · ${g.id}: ${mine.filter(r => r.pass).length}/${mine.length}`)
    }
    scores.push({ model: model.model, light, lead, hum })
  }
  return { scores }
}

const rate = (n: number, of: number) => `${n}/${of}`

const failedWhy = (r: LightScenarioResult) => r.error ?? r.steps.find(x => !x.pass)?.why ?? r.why ?? ''

/** A paced scenario's pace, in a line: the checks, the waits, the first invitation. */
const paceOf = (r: LightScenarioResult) => r.paced
  ? ` ${r.paced.checks} checks, waits ${r.paced.nextChecks.join(', ')} s, ${r.paced.firstInviteAtMs === null ? 'no invite' : `first invite at ${r.paced.firstInviteAtMs / 1000} s`}, ${r.paced.firstPresenceAtMs === null ? 'no presence check' : `presence check at ${r.paced.firstPresenceAtMs / 1000} s ("${r.paced.presenceLines[0]}")`}${r.paced.atLimit ? `, at the limit ${r.paced.atLimit.choice ?? 'no answer'}${r.paced.atLimit.words ? ` ("${r.paced.atLimit.words}")` : ''}` : ''}.`
  : ''

/** The scores as the report prints them: the light set by scenario, the library by group, with the calls that failed. */
export function voiceReport(scores: readonly ModelScores[], at: Date): string {
  const out = [`# Voice model checks, ${at.toISOString()}`, '']
  for (const s of scores) {
    out.push(`## ${s.model}`, '', '### Light model set', '', '| Scenario | Result | Why |', '|---|---|---|')
    for (const r of s.light) out.push(`| ${r.scenarioId} | ${r.pass ? 'passes' : 'fails'} | ${r.pass ? '' : failedWhy(r)}${paceOf(r)} |`)
    out.push('', `Passed ${rate(s.light.filter(r => r.pass).length, s.light.length)}. Tokens in ${s.light.reduce((n, r) => n + r.inputTokens, 0)}, out ${s.light.reduce((n, r) => n + r.outputTokens, 0)}.`)
    out.push('', "### The lead's scenario library", '', '| Group | Passed |', '|---|---|')
    for (const g of SCENARIO_GROUPS) {
      const mine = s.lead.filter(r => g.scenarios.some(x => x.id === r.scenarioId))
      out.push(`| ${g.title} | ${rate(mine.filter(r => r.pass).length, mine.length)} |`)
    }
    const failed = s.lead.filter(r => !r.pass)
    out.push('', `Passed ${rate(s.lead.length - failed.length, s.lead.length)}. Tokens in ${s.lead.reduce((n, r) => n + r.inputTokens, 0)}, out ${s.lead.reduce((n, r) => n + r.outputTokens, 0)}.`)
    if (failed.length > 0) out.push('', 'Failed:', ...failed.map(r => `- ${r.scenarioId} (${SCENARIO_GROUPS.find(g => g.scenarios.some(x => x.id === r.scenarioId))?.id}): ${r.error ? `call failed: ${r.error}` : r.did}`))
    if (s.hum.length > 0) out.push('', ...humReport(s.hum))
    out.push('')
  }
  return out.join('\n')
}

/** The hum set's part of the report: speed over every call, kind and tone at the marked points, and each point missed. */
function humReport(results: readonly HumTellingResult[]): string[] {
  const h = humSummary(results)
  const lines = ['### The hum set', '',
    `${h.calls} calls: median ${h.medianMs} ms, 90th percentile ${h.p90Ms} ms (target under 1,000), slowest ${h.slowestMs} ms; ${h.overLimit} over hq's 2 s limit, ${h.failed} failed.`,
    `Kind at the marked points: ${h.right}/${h.points} right, ${h.near} near (${h.noneRight}/${h.nonePoints} of the none points right). Tone, where the kind was right: ${h.toneRight}/${h.toned}.`,
    '', '| Telling | Point | Words end | Wanted | Got | Kind | Tone |', '|---|---|---|---|---|---|---|']
  for (const r of results) {
    for (const p of r.points) {
      const end = p.text.split(' ').slice(-4).join(' ')
      lines.push(`| ${r.tellingId} | ${p.mark + 1} | …${end} | ${p.want.kind}${p.want.tones ? ` ${p.want.tones.join('/')}` : ''} | ${p.got ? `${p.got.kind}${p.got.tone ? ` ${p.got.tone}` : ''}` : 'no answer'} | ${p.kind} | ${p.tone === null ? '' : p.tone ? 'right' : 'wrong'} |`)
    }
  }
  return lines
}

/** Calls that failed to reach the model are not the model's answer: a run with any of them is not a score. */
export const callFailures = (scores: readonly ModelScores[]): string[] =>
  scores.flatMap(s => [
    ...s.light.filter(r => r.error || r.steps.some(x => x.overLimit)).map(r => `${s.model} light ${r.scenarioId}`),
    ...s.lead.filter(r => r.error).map(r => `${s.model} lead ${r.scenarioId}`),
    ...s.hum.filter(r => r.failed > 0).map(r => `${s.model} hum ${r.tellingId}`),
  ])
