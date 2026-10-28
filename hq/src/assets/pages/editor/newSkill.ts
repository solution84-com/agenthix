import { isAssetName } from '@agenthix/core'
import { DESCRIPTION_MAX } from '../../validation'

export type StartingPoint = 'plain' | 'scripts' | 'agent'

/** The Agent Skills rules for what *New skill* asks for, as they are typed (board U3b section 1). Null: nothing wrong, or nothing typed yet. */
export function newSkillProblems(name: string, description: string): { name: string | null; description: string | null } {
  const text = description.trim()
  return {
    name: name === '' || isAssetName(name) ? null : 'Use 1 to 64 lowercase letters, digits and single hyphens, such as release-notes.',
    description: text.length > DESCRIPTION_MAX ? `That is ${text.length} characters; at most ${DESCRIPTION_MAX.toLocaleString('en-GB')}.` : null,
  }
}

/** *Ask an agent to write it*: the first message of the conversation with the skill creator. */
export function newSkillRequest(name: string, description: string): string {
  return [
    `Please write a new skill called ${name}.`,
    description.trim() ? `What it does, and when to use it: ${description.trim()}` : null,
    'Use the skill creator, agree the steps with me first, then propose it with propose_skill. Don’t write the skill into files yourself.',
  ].filter(Boolean).join('\n\n')
}
