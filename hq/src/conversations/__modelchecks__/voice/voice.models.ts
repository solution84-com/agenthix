/**
 * The voice checks (adaptive voice listening), run by `npm run test:models` only, with the same environment as the
 * lead's checks (src/conversations/__modelchecks__/README.md): the light model's eight moments and two paced pauses,
 * and the lead's 84 scenarios, scored against the spec, on the baseline model. They are the voice playground's former Scenarios mode.
 * About 100 model calls per model, a few thousand tokens each for the library. The scores are printed and written to
 * `hq/.model-checks/voice-<time>.md`; the check fails only when a call did not reach the model.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { callFailures, runVoiceChecks, voiceReport } from './voiceRun'

const OUT_DIR = path.resolve(__dirname, '../../../../.model-checks')

describe('the voice sets with a real model', () => {
  it('scores the light model\'s moments and the lead\'s scenarios', async ctx => {
    const only = (process.env.MODEL_CHECK_ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (only.length > 0 && !only.includes('voice')) return ctx.skip('MODEL_CHECK_ONLY names none of the voice checks')
    const result = await runVoiceChecks(process.env, { out: line => console.log(line) })
    if ('skipped' in result) return ctx.skip(result.skipped)
    const at = new Date()
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const file = path.join(OUT_DIR, `voice-${at.toISOString().replace(/[:.]/g, '-')}.md`)
    const text = voiceReport(result.scores, at)
    fs.writeFileSync(file, text)
    console.log(`\n${text}\nWritten to ${file}`)
    expect(callFailures(result.scores), 'calls that did not reach the model: see the lines above').toEqual([])
  }, 30 * 60 * 1000)
})
