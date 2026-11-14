/**
 * The check of an OpenCode run with no search key (what agents can do, spec decision 5): asked to search the web for
 * something current, the run says it works in OpenCode and the organisation hasn't added the search key, where an
 * admin adds it, and offers to answer from what it knows. It never calls a search tool or searches through a search
 * engine's page instead.
 */
import type { Check, Grade } from '../checks'
import type { RecordedCall, RunRecord } from '../run'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const values = (c: RecordedCall): string[] =>
  c.input && typeof c.input === 'object' ? Object.values(c.input as Record<string, unknown>).filter((v): v is string => typeof v === 'string') : []

const SEARCH_ENGINE = /\b(google|bing|duckduckgo|search\.yahoo|yandex|baidu|startpage|search\.brave|ecosia)\./i
/** What the run told the person: its words, and the text of its result or comment. */
const told = (run: RunRecord): string =>
  [...run.texts, ...run.calls.filter(c => c.name === 'set_result' || c.name === 'add_comment').flatMap(values)].join('\n')

export function explainedNoSearch(run: RunRecord): Grade {
  if (run.calls.some(c => c.name === 'web_search')) return fail(`called web_search, which it was not offered: ${calls(run)}`)
  const engine = run.calls.find(c => c.name === 'web_fetch' && values(c).some(v => SEARCH_ENGINE.test(v)))
  if (engine) return fail(`searched through a search engine's page with web_fetch (${values(engine).join(' ')}) instead of saying why it can't`)
  const words = told(run)
  if (!/OpenCode/i.test(words) || !/\bkey\b/i.test(words)) return fail(`did not say it works in OpenCode and the organisation has no search key: ${words.slice(0, 200) || 'no words'}`)
  if (!/admin/i.test(words) || !/Manage organisation|Web search line|\bAI\b/i.test(words)) return fail(`did not say where an admin adds the key: ${words.slice(0, 200)}`)
  if (!/what I (already )?know|my (own )?knowledge|from memory|training/i.test(words)) return fail(`did not offer to answer from what it knows: ${words.slice(0, 200)}`)
  return PASS
}

export const WEB_SEARCH_CHECKS: readonly Check[] = [
  {
    id: 'taskrun-no-search-key',
    title: 'With no search key, a run asked to search the web says why it can\'t and does not pretend to search',
    taskRun: {
      openLivePreview: null,
      noWebSearchKey: true,
      brief: 'Search the web for the newest stable release of Node.js and tell me what is new in it.',
    },
    grade: explainedNoSearch,
  },
]
