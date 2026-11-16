/**
 * The skills checks (skills spec, *Testing*; #92): what an agent does with the skills it is listed. Each is a message
 * as a real turn sends it and what passes. A grade reads only the calls a run made and its words, never exact wording.
 */
import { asPlainText, pickedSkillInstruction, pickedSkillReadInstruction } from '@agenthix/core'
import type { Grade } from '../../../conversations/__modelchecks__/checks'
import type { RecordedCall, RunRecord } from '../../../conversations/__modelchecks__/run'
import { ASK as PROPOSE_ASK, PROPOSE_SKILL_CHECK_ID, grade as gradePropose, writesInShell } from './proposeSkillCheck'
import { READ_TOOL, SKILLS, SKILL_TOOL, WORK_TOOLS, skillFile } from './skillsWorld'

export interface SkillCheck {
  id: string
  title: string
  /** The message the agent is sent. */
  ask: string
  grade(run: RunRecord): Grade
}

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })
const calls = (run: RunRecord): string => run.calls.map(c => c.name).join(', ') || 'no tool call'
const argOf = (c: RecordedCall, key: string): string => {
  const input = c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {}
  return String(input[key] ?? '')
}
const loads = (name: string) => (c: RecordedCall) => c.name === SKILL_TOOL && argOf(c, 'name') === name

/** Commands that only look: a shell command made only of them, writing no file, is reading, not work. */
const LOOKS = new Set(['ls', 'pwd', 'cat', 'head', 'tail', 'find', 'tree', 'grep', 'rg', 'wc', 'echo', 'cd', 'file', 'stat'])
const looksOnly = (command: string): boolean =>
  !writesInShell(command) && command.split(/\s*(?:&&|\|\||;|\||\n)\s*/).every(part => part.trim() === '' || LOOKS.has(part.trim().split(/\s+/)[0]!))
const isWork = (c: RecordedCall): boolean => WORK_TOOLS.has(c.name) && !(c.name === 'bash' && looksOnly(argOf(c, 'command')))

const RELEASE_NOTES = 'org-release-notes'
const CODE_REVIEW = 'person-code-review'

/** The skill tool loaded the organisation's release-notes skill before any work was done. */
function loadedBeforeWork(run: RunRecord, name: string): Grade {
  const load = run.calls.findIndex(loads(name))
  if (load < 0) return fail(`never loaded ${name} with the skill tool: ${calls(run)}`)
  const work = run.calls.findIndex(isWork)
  if (work >= 0 && work < load) return fail(`did work before loading ${name}: ${calls(run)}`)
  return PASS
}

function whatCanYouDo(run: RunRecord): Grade {
  const work = run.calls.find(isWork)
  if (work) return fail(`started work instead of answering (${work.name}): ${calls(run)}`)
  const said = (run.answer ?? run.texts.join(' ')).toLowerCase().replace(/-/g, ' ')
  // By its full name or the part after where it comes from, hyphens or spaces: "org-release-notes", "release notes".
  const named = SKILLS.filter(s => said.includes(s.name.replace(/-/g, ' ')) || said.includes(s.name.replace(/^[a-z]+-/, '').replace(/-/g, ' ')))
  if (named.length < 2) return fail(`named ${named.length} of the listed skills, at least 2 needed: ${said.slice(0, 600)}`)
  return PASS
}

function pickedRead(run: RunRecord): Grade {
  const file = skillFile(CODE_REVIEW)
  if (run.calls.some(loads(CODE_REVIEW))) return fail(`loaded ${CODE_REVIEW} with the skill tool, which it must not: ${calls(run)}`)
  const first = run.calls[0]
  const reads = (c: RecordedCall) => (c.name === READ_TOOL && argOf(c, 'file_path') === file) || (c.name === 'bash' && argOf(c, 'command').includes(file))
  if (!first || !reads(first)) return fail(`did not read ${file} first: ${calls(run)}`)
  return PASS
}

function pickedLoad(run: RunRecord): Grade {
  const first = run.calls[0]
  if (!first || !loads(RELEASE_NOTES)(first)) return fail(`did not load ${RELEASE_NOTES} first: ${calls(run)}`)
  return PASS
}

export const SKILL_CHECKS: readonly SkillCheck[] = [
  {
    id: PROPOSE_SKILL_CHECK_ID,
    title: 'asked to make a team skill, proposes it with propose_skill and writes no files',
    ask: PROPOSE_ASK,
    grade: gradePropose,
  },
  {
    id: 'skill-use',
    title: 'a task that matches an organisation skill loads it with the skill tool before writing',
    ask: 'Write the release notes for 2.4',
    grade: run => loadedBeforeWork(run, RELEASE_NOTES),
  },
  {
    id: 'skill-picked',
    title: 'a skill the person picked is loaded first, with the skill tool',
    ask: `${pickedSkillInstruction(RELEASE_NOTES)}\n\n${asPlainText('/release-notes for 2.4: the new login page, and a fixed crash on save')}`,
    grade: pickedLoad,
  },
  {
    id: 'skill-picked-read',
    title: 'a skill only a person picks is read from its file first, never loaded with the skill tool',
    ask: `${pickedSkillReadInstruction(CODE_REVIEW, skillFile(CODE_REVIEW))}\n\n${asPlainText('/code-review the checkout change')}`,
    grade: pickedRead,
  },
  {
    id: 'skill-what-can-you-do',
    title: 'asked what it can do, names skills from its list and starts no work',
    ask: 'What can you do?',
    grade: whatCanYouDo,
  },
]

