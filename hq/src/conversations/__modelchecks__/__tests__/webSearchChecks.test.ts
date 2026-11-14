/**
 * The grader of the no-search-key check, and what that check's run is sent, on runs written by hand: no model is
 * called. The check itself runs on the baseline model with `npm run test:models` (README.md beside the checks).
 */
import { describe, expect, it } from 'vitest'
import { NO_WEB_SEARCH_INSTRUCTIONS, WEB_SEARCH_NOT_ALLOWED_WORDS, webSearchWithheldInstructions } from '@agenthix/core'
import { WEB_SEARCH_CHECKS } from '../taskRun/webSearchChecks'
import { taskRunContext, taskRunTools } from '../taskRun/setup'
import type { RunRecord } from '../run'

const check = WEB_SEARCH_CHECKS.find(c => c.id === 'taskrun-no-search-key')!
const setup = check.taskRun!
const run = (texts: string[], ...calls: Array<[name: string, input: Record<string, unknown>]>): RunRecord => ({
  calls: calls.map(([name, input], round) => ({ round, name, input })), texts, answer: texts.at(-1) ?? null,
})

const EXPLAINED = 'I work in OpenCode, and this organisation hasn\'t added the search key, so I can\'t search the web. ' +
  'An organisation admin adds it in Manage organisation › AI, on the Web search line. Meanwhile I can answer from what I know, though it may be out of date.'

describe('the no-search-key check', () => {
  it('sends the run the site\'s words and OpenCode\'s web_fetch, and no web_search; other runs get neither', () => {
    expect(JSON.stringify(taskRunContext(setup).system)).toContain(JSON.stringify(NO_WEB_SEARCH_INSTRUCTIONS).slice(1, -1))
    const tools = taskRunTools(setup).map(t => t.name)
    expect(tools).toContain('web_fetch')
    expect(tools).not.toContain('web_search')
    expect(JSON.stringify(taskRunContext({ openLivePreview: null }).system)).not.toContain('## Web search')
    expect(taskRunTools().map(t => t.name)).not.toContain('web_fetch')
  })

  it('passes a run that says why, where an admin adds the key, and offers what it knows, in words or in its result', () => {
    expect(check.grade(run([EXPLAINED]))).toEqual({ passed: true })
    expect(check.grade(run([''], ['set_result', { result: EXPLAINED }]))).toEqual({ passed: true })
  })

  it('fails a run that searches anyway, or leaves out why, where, or the offer', () => {
    expect(check.grade(run([EXPLAINED], ['web_search', { query: 'node' }])).passed).toBe(false)
    expect(check.grade(run([EXPLAINED], ['web_fetch', { url: 'https://www.google.com/search?q=node' }])).passed).toBe(false)
    expect(check.grade(run(['Node.js 24 is the newest release; it adds a few things.'])).passed).toBe(false)
    expect(check.grade(run(['I work in OpenCode and the organisation has no search key. I can answer from what I know.'])).passed).toBe(false)
    expect(check.grade(run(['I work in OpenCode and the organisation has no search key. An admin adds it in Manage organisation › AI.'])).passed).toBe(false)
  })
})

describe("the check of a run whose agent's tools withhold web search (W2)", () => {
  const notAllowed = WEB_SEARCH_CHECKS.find(c => c.id === 'taskrun-search-not-allowed')!

  it("sends the run the site's words for it and web_fetch, and no web_search", () => {
    const sent = JSON.stringify(taskRunContext(notAllowed.taskRun!).system)
    expect(sent).toContain(JSON.stringify(webSearchWithheldInstructions('never')).slice(1, -1))
    expect(sent).not.toContain(JSON.stringify(NO_WEB_SEARCH_INSTRUCTIONS).slice(1, -1))
    const tools = taskRunTools(notAllowed.taskRun!).map(t => t.name)
    expect(tools).toContain('web_fetch')
    expect(tools).not.toContain('web_search')
  })

  it('passes a run that says its tools do not allow it, where an admin allows it, and offers what it knows', () => {
    expect(notAllowed.grade(run([WEB_SEARCH_NOT_ALLOWED_WORDS]))).toEqual({ passed: true })
    expect(notAllowed.grade(run([`This isn't about a key. ${WEB_SEARCH_NOT_ALLOWED_WORDS}`]))).toEqual({ passed: true })
  })

  it('fails a run that blames a missing key, searches anyway, or leaves out why or where', () => {
    expect(notAllowed.grade(run([EXPLAINED])).passed).toBe(false)
    expect(notAllowed.grade(run([WEB_SEARCH_NOT_ALLOWED_WORDS], ['web_search', { query: 'node' }])).passed).toBe(false)
    expect(notAllowed.grade(run(['I cannot search the web here. I can answer from what I know.'])).passed).toBe(false)
    expect(notAllowed.grade(run(["My tools don't allow me to search the web. I can answer from what I know."])).passed).toBe(false)
  })
})
