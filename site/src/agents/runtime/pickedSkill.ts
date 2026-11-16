/**
 * What a turn's message becomes on either runtime (skills spec part 5, Picking a skill; security review M7).
 *
 * Text is never a command: Claude Code runs a message that starts with `/` as one of its commands (`/init`,
 * `/compact`, a skill by its name), so text that starts with one is given after a line saying it is plain text, and
 * no longer starts with it. OpenCode takes commands on a route of their own (`/session/:id/command`), not from a
 * message's text; it is given the same words, so both runtimes read the same message. The container tests hold both
 * runtimes to this.
 *
 * The skill a person picked is hq's to send and this site's to check: it is kept only when it names a skill staged
 * for this turn that does not set `user-invocable: false`, and then becomes one explicit instruction before the
 * message. Anything else is dropped, logged, and the message goes on as it is. A skill that sets
 * `disable-model-invocation: true` is one only a person invokes, so picking it is its use; the skill tool refuses it
 * on Claude, so the instruction names its staged `SKILL.md` to read instead, on both runtimes. That path is the
 * site's own (the staging folder the run's read-only tools may read, and a staged name already checked), never
 * anything a message carried.
 */
import { PLAIN_TEXT_LINE, asPlainText, pickedSkillInstruction, pickedSkillReadInstruction } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import type { RunContext } from './types'

const logger = new Logger('PickedSkill')

export { PLAIN_TEXT_LINE, asPlainText, pickedSkillInstruction, pickedSkillReadInstruction }

/**
 * A staged skill as the check reads it: whether a person may pick it, whether the model may load it with its skill
 * tool, and its `SKILL.md` as the run sees it.
 */
export type InvocableSkill = { name: string; userInvocable: boolean; modelInvocable: boolean; skillFile: string }

/** The staged skill a person picked, when they may invoke it and it is staged for this turn; otherwise null, logged. */
export function acceptedPickedSkill(picked: string | undefined, staged: readonly InvocableSkill[], runId: string): InvocableSkill | null {
  if (!picked) return null
  const skill = staged.find(s => s.name === picked)
  if (skill?.userInvocable) return skill
  const why = skill ? 'it sets user-invocable: false' : 'no skill of that name is staged for this turn'
  logger.warn(`run ${runId}: the picked skill ${JSON.stringify(picked.slice(0, 80))} was dropped: ${why}`)
  return null
}

/** The turn's prompt with the picked skill's instruction before it, when the pick is kept. */
export function withPickedSkill(prompt: string, picked: string | undefined, staged: readonly InvocableSkill[], runId: string): string {
  const skill = acceptedPickedSkill(picked, staged, runId)
  if (!skill) return prompt
  const instruction = skill.modelInvocable ? pickedSkillInstruction(skill.name) : pickedSkillReadInstruction(skill.name, skill.skillFile)
  return `${instruction}\n\n${prompt}`
}

/**
 * The message a runtime is given for this turn: Summarise now's own command as it is (the one command the site
 * sends, `SUMMARISE_NOW_INPUT`), and anything else as plain text, after the picked skill's instruction when kept.
 */
export function turnPrompt(context: Pick<RunContext, 'prompt' | 'summarise' | 'pickedSkill' | 'runId'>, staged: readonly InvocableSkill[]): string {
  if (context.summarise) return context.prompt
  return withPickedSkill(asPlainText(context.prompt), context.pickedSkill, staged, context.runId)
}
