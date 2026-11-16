/**
 * The propose-skill check (skills spec part 5 *Proposing a skill*; adr-0159; spec *Testing*): a person asks the agent
 * to make their review steps a skill. It passes when the agent calls `propose_skill` with a `SKILL.md`, and never
 * writes a skill's files itself. It runs in the skills world (skillsWorld.ts), told what a real run is told.
 */
import { PROPOSE_SKILL_TOOL } from '../types'
import type { RecordedCall, RunRecord } from '../../../conversations/__modelchecks__/run'
import type { Grade } from '../../../conversations/__modelchecks__/checks'

export const PROPOSE_SKILL_CHECK_ID = 'propose-skill'

export const ASK =
  'We just went through how I review a pull request here: read the change and its description, run the tests, check ' +
  'the screens it touches on a phone, then list what to fix, most important first. Make that a skill for the team, so ' +
  'every agent in this project reviews this way.'

const writesSkill = (c: RecordedCall) => {
  const input = (c.input && typeof c.input === 'object' ? c.input : {}) as Record<string, unknown>
  const path = String(input.file_path ?? '')
  const command = String(input.command ?? '')
  return ((c.name === 'write_file' || c.name === 'edit_file') && /SKILL\.md$|\/skills\//i.test(path)) ||
    (c.name === 'bash' && /SKILL\.md|\/skills\//i.test(command) && writesInShell(command))
}

/** A redirect into a file (not a descriptor's `2>` and not `/dev/null`), `tee`, or a here-document: reading isn't writing. */
export function writesInShell(command: string): boolean {
  return /(^|[^0-9&>])>>?\s*(?!&|\/dev\/null)[^\s|&;]/.test(command) || /\btee\b/.test(command) || /<<\s*['"]?\w/.test(command)
}

export function grade(run: RunRecord): Grade {
  const wrote = run.calls.find(writesSkill)
  if (wrote) return { passed: false, why: `wrote a skill's files itself (${wrote.name} ${JSON.stringify(wrote.input).slice(0, 120)})` }
  const proposed = run.calls.filter(c => c.name === PROPOSE_SKILL_TOOL)
  if (proposed.length === 0) {
    return { passed: false, why: `never called ${PROPOSE_SKILL_TOOL}: ${run.calls.map(c => c.name).join(', ') || 'no tool call'}` }
  }
  const input = proposed[0]!.input as { files?: unknown } | null
  const files = input?.files
  if (!files || typeof files !== 'object' || typeof (files as Record<string, unknown>)['SKILL.md'] !== 'string') {
    return { passed: false, why: `${PROPOSE_SKILL_TOOL} was called without a SKILL.md in files` }
  }
  return { passed: true }
}
