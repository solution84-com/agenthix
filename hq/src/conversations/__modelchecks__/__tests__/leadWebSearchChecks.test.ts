/**
 * The graders of a conversation asked to search the web, and what those checks' turns are sent, on runs written by
 * hand: no model is called. The checks run on the baseline model with `npm run test:models` (README.md beside them).
 */
import { describe, expect, it } from 'vitest'
import { NO_WEB_SEARCH_WORDS, WEB_SEARCH_NOT_ALLOWED_WORDS } from '@agenthix/core'
import { CHECKS, type Check } from '../checks'
import { SEARCH_ASK } from '../leadWebSearchChecks'
import { contextOf, type CheckSetup } from '../setup'
import type { RunRecord } from '../run'

const check = (id: string) => CHECKS.find(c => c.id === id) as Check & { setup: CheckSetup }
const run = (texts: string[], ...calls: Array<[name: string, input: Record<string, unknown>]>): RunRecord => ({
  calls: calls.map(([name, input], round) => ({ round, name, input })), texts, answer: texts.at(-1) ?? null,
})
const turnText = (setup: CheckSetup): string => JSON.stringify(contextOf(setup).messages)

const STARTED = run(["I'm looking that up on the web now — I'll tell you what I find."], ['start_work', { boundary: 'WEB', title: 'Newest Node.js release', brief: SEARCH_ASK }])
const EXPLAINED = `${NO_WEB_SEARCH_WORDS} Want me to tell you what I know?`

describe('the checks of a conversation asked to search the web (W1, W2) @SC-2159', () => {
  it("sends the turn the web search block in the check's state, and nothing for a check without one", () => {
    expect(turnText(check('web-search-background').setup)).toContain('Work you do in the background can search the web')
    expect(turnText(check('web-search-background-key').setup)).toContain('in OpenCode, with this organisation')
    expect(turnText(check('web-search-no-key').setup)).toContain(JSON.stringify(NO_WEB_SEARCH_WORDS).slice(1, -1))
    expect(turnText(check('web-search-ask').setup)).toContain("they'll be asked to approve the search")
    expect(turnText(check('web-search-not-allowed').setup)).toContain(JSON.stringify(WEB_SEARCH_NOT_ALLOWED_WORDS).slice(1, -1))
    expect(turnText(check('in-reach').setup)).not.toContain('[Web search, checked this turn]')
  })

  it('where it can search, passes work started with the ask in its brief', () => {
    expect(check('web-search-background').grade(STARTED)).toEqual({ passed: true })
    expect(check('web-search-background-key').grade(STARTED)).toEqual({ passed: true })
  })

  it("where it can search, fails a reply that says it can't reach the web, sends the person elsewhere, or starts nothing", () => {
    const grade = check('web-search-background').grade
    expect(grade(run(["I can't reach the web — I have no browsing tool here."])).passed).toBe(false)
    expect(grade(run(['Ask one of your agents with web access.'], ['start_work', { brief: SEARCH_ASK }])).passed).toBe(false)
    expect(grade(run(['Node.js 24 is the newest release.'])).passed).toBe(false)
    expect(grade(run(["I'm on it."], ['start_work', { brief: 'Look into it.' }])).passed).toBe(false)
  })

  it("where it can't, passes a reply in core's words that starts nothing, and fails one that starts work or leaves out why", () => {
    const grade = check('web-search-no-key').grade
    expect(grade(run([EXPLAINED]))).toEqual({ passed: true })
    expect(grade(run([EXPLAINED], ['start_work', { brief: SEARCH_ASK }])).passed).toBe(false)
    expect(grade(run(["I can't search the web right now."])).passed).toBe(false)
  })

  it("at Ask, passes work started with the ask that says approval will be asked for, and fails one that doesn't", () => {
    const grade = check('web-search-ask').grade
    const asking = run(["I'm looking that up in the background; you'll be asked to approve the search."], ['start_work', { brief: SEARCH_ASK }])
    expect(grade(asking)).toEqual({ passed: true })
    expect(grade(STARTED).passed).toBe(false)
    expect(grade(run(["You'll be asked to approve it."])).passed).toBe(false)
  })

  it("at Never, passes core's words that start nothing, and fails a reply that starts work, blames a key, or leaves out where", () => {
    const grade = check('web-search-not-allowed').grade
    expect(grade(run([`${WEB_SEARCH_NOT_ALLOWED_WORDS} Want me to?`]))).toEqual({ passed: true })
    expect(grade(run([WEB_SEARCH_NOT_ALLOWED_WORDS], ['start_work', { brief: SEARCH_ASK }])).passed).toBe(false)
    expect(grade(run([EXPLAINED])).passed).toBe(false)
    expect(grade(run(["My tools don't allow me to search the web. I can answer from what I know."])).passed).toBe(false)
  })
})
