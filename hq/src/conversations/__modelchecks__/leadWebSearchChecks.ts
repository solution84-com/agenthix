/**
 * The checks of a conversation asked to search the web (walkthrough findings W1 and W2): a reply has no web search,
 * and is told each turn whether its background work has (`lead/webSearchBlock.ts`). Where it can, the search is
 * started in the background with the person's words in the brief, and the reply never says it can't reach the web —
 * at Ask, it says the person will be asked to approve it; where it can't, the reply says why in core's words and
 * starts nothing: the agent's tools set Search the web to Never, or OpenCode has no search key.
 */
import { OPENCODE_RUNTIME, CLAUDE_SDK_RUNTIME } from '@agenthix/core'
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { explainedNoSearch, explainedNotAllowed } from './taskRun/webSearchChecks'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const argsOf = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})

export const SEARCH_ASK = 'Search the web for the newest Node.js release.'
const STARTS = new Set(['start_work', 'run_task', 'create_task'])
/** What W1's reply said instead: that it can't reach the web, or that another agent can. */
const CANT_REACH = /can(?:no|')t (?:reach|access|browse|search) the (?:web|internet)|no (?:browsing|web(?: search)?|internet) (?:tool|access)|(?:another|other|one of your) agents?\b|agents? with web access/i

export function searchedInBackground(run: RunRecord): Grade {
  const said = run.texts.join('\n')
  if (CANT_REACH.test(said)) return fail(`said it can't reach the web or sent the person elsewhere: ${said.slice(0, 200)}`)
  const started = run.calls.find(c => c.name === 'start_work')
  if (!started) return fail(`started no work for the search: ${calls(run)}`)
  const brief = typeof argsOf(started.input).brief === 'string' ? (argsOf(started.input).brief as string) : ''
  if (!/node(?:\.js)?/i.test(brief) || !/\b(?:web|search|newest|latest)\b/i.test(brief)) {
    return fail(`the brief does not carry the person's request: ${brief.slice(0, 200) || 'no brief'}`)
  }
  return PASS
}

/** At Ask: started in the background as at Always, and the person told they'll be asked to approve it. */
export function searchedInBackgroundAsking(run: RunRecord): Grade {
  const searched = searchedInBackground(run)
  if (!searched.passed) return searched
  const said = run.texts.join('\n')
  return /approv/i.test(said) ? PASS : fail(`did not say the person will be asked to approve the search: ${said.slice(0, 200) || 'no words'}`)
}

const startedNothing = (explained: (run: RunRecord) => Grade) => (run: RunRecord): Grade => {
  const started = run.calls.find(c => STARTS.has(c.name))
  if (started) return fail(`started work for a search it can't do: ${calls(run)}`)
  return explained(run)
}

export const saidNoSearchStartedNothing = startedNothing(explainedNoSearch)
export const saidNotAllowedStartedNothing = startedNothing(explainedNotAllowed)

export const LEAD_WEB_SEARCH_CHECKS: readonly Check[] = [
  {
    id: 'web-search-background',
    title: 'Asked to search the web, with background work in Claude Code: the search is started in the background',
    setup: { home: 'project', message: SEARCH_ASK, webSearch: { runtime: CLAUDE_SDK_RUNTIME, permission: 'always', searchKey: false } },
    grade: searchedInBackground,
  },
  {
    id: 'web-search-background-key',
    title: 'Asked to search the web, with background work in OpenCode and a search key: the search is started in the background',
    setup: { home: 'your-space', message: SEARCH_ASK, webSearch: { runtime: OPENCODE_RUNTIME, permission: 'always', searchKey: true } },
    grade: searchedInBackground,
  },
  {
    id: 'web-search-no-key',
    title: 'Asked to search the web, with background work in OpenCode and no search key: says why, and starts nothing',
    setup: { home: 'project', message: SEARCH_ASK, webSearch: { runtime: OPENCODE_RUNTIME, permission: 'always', searchKey: false } },
    grade: saidNoSearchStartedNothing,
  },
  {
    id: 'web-search-ask',
    title: 'Asked to search the web, with Search the web at Ask in Claude Code: started in the background, and says it will be asked for approval',
    setup: { home: 'project', message: SEARCH_ASK, webSearch: { runtime: CLAUDE_SDK_RUNTIME, permission: 'ask', searchKey: false } },
    grade: searchedInBackgroundAsking,
  },
  {
    id: 'web-search-not-allowed',
    title: "Asked to search the web, with Search the web at Never: says the agent's tools don't allow it and where an admin allows it, and starts nothing",
    setup: { home: 'project', message: SEARCH_ASK, webSearch: { runtime: OPENCODE_RUNTIME, permission: 'never', searchKey: true } },
    grade: saidNotAllowedStartedNothing,
  },
]
