/**
 * The skill a person picked with `/` (skills spec part 5, Picking a skill): kept on their message, and carried with
 * the work the lead hands on in the turn that answers it, to the run that does it. hq checks only its shape; the site
 * keeps it only when a skill of that name is staged for the run and a person may invoke it.
 */
import { HttpError } from 'wasp/server'
import { pickedSkillOf, type PickedSkill } from '@agenthix/core'
import { readPickedSkillOfTurn } from '../store/messages'

/** The picked skill a send names, or undefined when it names none. A malformed one refuses the send. */
export function requirePickedSkill(value: unknown): PickedSkill | undefined {
  if (value === undefined || value === null) return undefined
  const skill = pickedSkillOf(value)
  if (!skill) throw new HttpError(400, "That isn't the name of a skill. Pick the skill again from the list. Nothing was changed.")
  return skill
}

/** The skill picked for the newest of a turn's messages that picked one, or null. */
export const pickedSkillOfTurn = readPickedSkillOfTurn

/** What the lead reads beside a message that picked a skill: the work it hands on loads it. */
export function pickedSkillNote(skill: PickedSkill): string {
  return `[The person picked the skill ${skill.name} for this message. Do what they ask as work (start_work, or run_task in a task's conversation): the work is told to load that skill.]`
}
