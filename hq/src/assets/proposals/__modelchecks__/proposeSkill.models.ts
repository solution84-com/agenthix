/**
 * The model check that an agent proposes a skill rather than writes one (proposeSkillCheck.ts), run by
 * `npm run test:models` only, with the same environment as the lead's checks
 * (src/conversations/__modelchecks__/README.md): the baseline model, each run as many times as MODEL_CHECK_RUNS asks.
 * About 6 model calls per run, each a few thousand tokens.
 */
import { describe, expect, it } from 'vitest'
import { createModelAdapter } from '../../../conversations/model'
import { checkAccess, checkAsked } from '../../../conversations/__modelchecks__/env'
import { PROPOSE_SKILL_CHECK_ID, grade, runCheck } from './proposeSkillCheck'

describe('an agent asked to make a skill, with a real model', () => {
  it('proposes it with propose_skill and never writes its files', async ctx => {
    if (!checkAsked(process.env, PROPOSE_SKILL_CHECK_ID)) return ctx.skip(`MODEL_CHECK_ONLY does not name ${PROPOSE_SKILL_CHECK_ID}`)
    const access = checkAccess(process.env)
    if ('skip' in access) return ctx.skip(access.skip)
    const adapter = createModelAdapter({ record: () => {}, maxRetries: 2 })
    const failures: string[] = []
    for (const model of access.accesses) {
      for (let run = 1; run <= access.runs; run++) {
        let line: string
        try {
          const result = grade(await runCheck(adapter, model))
          line = result.passed ? 'passed' : `failed: ${result.why}`
        } catch (err) {
          line = `failed: the model call failed: ${err instanceof Error ? err.message : 'unknown'}`
        }
        line = line.split(model.apiKey).join('[key]')
        console.log(`${model.model} · ${PROPOSE_SKILL_CHECK_ID} · run ${run}: ${line}`)
        if (line !== 'passed') failures.push(`${model.model} run ${run}: ${line}`)
      }
    }
    expect(failures, 'a run did not propose the skill: see the lines above').toEqual([])
  })
})
