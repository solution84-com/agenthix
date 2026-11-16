/**
 * The checks (agent knowledge spec, part 6, V1; the walkthrough's D steps): each a place, what was said, and what
 * the lead must do with it. A grade reads only the calls a run made and its words.
 */
import { PERSONAL_LEVEL } from '../../knowledge/reach'
import type { RecordedCall, RunRecord } from './run'
import type { CheckSetup } from './setup'
import { PROJECT, PROJECT_LEVEL, RELEASE_PAGE, levelOf } from './world'
import { FILE_CHECKS } from './fileChecks'
import { CODE_WORK_CHECKS } from './codeWorkChecks'
import { LIVE_PREVIEW_CHECKS } from './livePreviewChecks'
import { TASK_RUN_CHECKS } from './taskRun/checks'
import { STARTING_CHECKS } from './taskRun/startingChecks'
import { WEB_SEARCH_CHECKS } from './taskRun/webSearchChecks'
import { LEAD_WEB_SEARCH_CHECKS } from './leadWebSearchChecks'
import { TASK_TOOL_CHECKS } from './taskToolChecks'
import { MEMORY_CHECKS } from './memoryChecks'
import { FOLD_CHECKS } from './foldChecks'
import type { TaskRunSetup } from './taskRun/setup'

export type Grade = { passed: true } | { passed: false; why: string }

/** A check of the lead's turn (`setup`), or of a task's run on a branch (`taskRun`): one of the two. */
export type Check = {
  id: string
  title: string
  grade(run: RunRecord): Grade
  /** How many times the check runs on each model, in place of MODEL_CHECK_RUNS: a check read as a rate. */
  runs?: number
  /** The share of those runs that must pass, instead of all of them. */
  minPassRate?: number
} & ({ setup: CheckSetup; taskRun?: never } | { taskRun: TaskRunSetup; setup?: never })

type Args = Record<string, unknown>
const argsOf = (c: RecordedCall): Args => (c.input && typeof c.input === 'object' ? (c.input as Args) : {})
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

/** The calls in order, as one line: `search_knowledge(scope=platform), read_knowledge`. */
export function callsInWords(run: RunRecord): string {
  if (run.calls.length === 0) return 'no tool call'
  return run.calls.map(c => {
    const a = argsOf(c)
    const shown = ['scope', 'page', 'place', 'boundary'].filter(k => text(a[k])).map(k => `${k}=${text(a[k])}`)
    return shown.length ? `${c.name}(${shown.join(', ')})` : c.name
  }).join(', ')
}

/** Whether the run's words end by asking the person something instead of answering. */
function askedBack(run: RunRecord): boolean {
  return /\?\s*$/.test(run.texts.filter(t => t.trim()).at(-1) ?? '')
}

/** The level a knowledge call names, by its scope, its path or its page. */
function levelNamed(c: RecordedCall): string | null {
  const a = argsOf(c)
  const scope = text(a.scope).replace(/:$/, '')
  if (scope) return scope
  const named = text(a.page) || text(a.path)
  return named.includes(':') ? levelOf(named) : null
}

function searched(run: RunRecord, fits: (level: string | null) => boolean): boolean {
  const rounds = run.calls.filter(c => c.name === 'search_knowledge' && fits(levelNamed(c))).map(c => c.round)
  // Before the answer: a search in a round the run went on from.
  return rounds.length > 0 && (run.answer === null || Math.min(...rounds) < run.texts.length - 1)
}

function searchedFirst(run: RunRecord, fits: (level: string | null) => boolean, what: string): Grade {
  if (searched(run, fits)) return PASS
  if (run.calls.length === 0) return fail(askedBack(run) ? 'asked the person back without searching' : 'answered without searching')
  return fail(`no ${what} before the answer: ${callsInWords(run)}`)
}

function suggested(run: RunRecord, names: readonly string[]): boolean {
  return run.calls.some(c => c.name === 'suggest_place' && names.includes(text(argsOf(c).place).replace(/:$/, '').toLowerCase()))
}

const unscopedOrGuide = (level: string | null) => level === null || level === 'platform'
const inReach = (level: string | null) => level === null || level === PROJECT_LEVEL || level === 'org'

function guideFirst(id: string, message: string): Check {
  return {
    id,
    title: `Guide first: "${message}"`,
    setup: { home: 'project', message },
    grade: run => searchedFirst(run, unscopedOrGuide, 'search of the guide (unscoped or scope platform)'),
  }
}

export const RELEASE_ANSWER =
  'From the *Release process* page: tag the merged commit on main, staging deploys go out after the checks pass, and ' +
  'production deploys need a second person to approve them, never on a Friday.'

export const CHECKS: readonly Check[] = [
  guideFirst('guide-model-key', 'Where do I add a model key?'),
  guideFirst('guide-voice', 'How do I turn voice on?'),
  {
    id: 'my-space',
    title: 'My space, from a project conversation',
    setup: { home: 'project', message: 'Look through the files in my space.' },
    grade(run) {
      const project = run.calls.find(c => c.name === 'start_work' || ((c.name === 'read_knowledge' || c.name === 'search_knowledge') && levelNamed(c) === PROJECT_LEVEL))
      if (project) return fail(`used the conversation's project instead: ${callsInWords(run)}`)
      if (suggested(run, [PERSONAL_LEVEL, 'your space'])) return PASS
      return fail(`no suggest_place for Your space: ${callsInWords(run)}`)
    },
  },
  {
    id: 'place-outside',
    title: 'A place outside the conversation, from Your space',
    setup: { home: 'your-space', message: `What's the release process in ${PROJECT.name}?` },
    grade(run) {
      if (suggested(run, [PROJECT_LEVEL, PROJECT.key.toLowerCase(), PROJECT.name.toLowerCase()])) return PASS
      return fail(`no suggest_place for ${PROJECT.name}: ${callsInWords(run)}`)
    },
  },
  {
    id: 'correction',
    title: 'A correction to a page',
    setup: {
      home: 'project',
      before: [{ role: 'person', text: "What's our release process?" }, { role: 'agent', text: RELEASE_ANSWER }],
      message: "The release process page is wrong: staging deploys need Mia's approval before 4pm.",
    },
    grade(run) {
      const wrong = run.calls.find(c => c.name === 'remember' || c.name === 'start_work')
      if (wrong) return fail(`called ${wrong.name}: ${callsInWords(run)}`)
      const changed = run.calls.some(c => (c.name === 'edit_knowledge' || c.name === 'write_knowledge') && text(argsOf(c).page) === RELEASE_PAGE)
      return changed ? PASS : fail(`no change to ${RELEASE_PAGE}: ${callsInWords(run)}`)
    },
  },
  {
    id: 'in-reach',
    title: 'In reach: the project\'s own process',
    setup: { home: 'project', message: "What's our release process?" },
    grade: run => searchedFirst(run, inReach, 'search_knowledge'),
  },
  ...FILE_CHECKS,
  ...CODE_WORK_CHECKS,
  ...LIVE_PREVIEW_CHECKS,
  ...TASK_RUN_CHECKS,
  ...STARTING_CHECKS,
  ...WEB_SEARCH_CHECKS,
  ...LEAD_WEB_SEARCH_CHECKS,
  ...TASK_TOOL_CHECKS,
  ...MEMORY_CHECKS,
  ...FOLD_CHECKS,
]
