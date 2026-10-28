/**
 * `propose_skill`, the agent's only way to write a skill (skills spec part 5 *Proposing a skill*; adr-0159): served by
 * a run's site and forwarded to hq's data path with the calling run's id, which the site fills in, like the workflow
 * tools (adr-0148). Declared once here, in the workflow tools' shape, so hq's validator and the site's forwarded copy
 * are built from the same words. Written for the baseline model: what it does, when to use it, what each argument is.
 *
 * Who asked is never an argument: hq takes the person from the run's on-behalf-of record. A draft or a proposal
 * reaches no agent until a person accepts or publishes it.
 */
import type { WorkflowToolArg } from '../workflows/agentTools.js'

export const PROPOSE_SKILL_TOOL = 'propose_skill'

/** Proposals and draft changes one run may make; more is an agent proposing in a loop. */
export const MAX_SKILL_PROPOSALS_PER_RUN = 5

/** Who a proposal is for. On the wire `aim` is text; hq refuses anything else. */
export const PROPOSE_SKILL_AIMS = ['organisation', 'project', 'person'] as const
export type ProposeSkillAim = (typeof PROPOSE_SKILL_AIMS)[number]

export type SkillToolDeclaration = {
  name: typeof PROPOSE_SKILL_TOOL
  description: string
  args: Record<string, WorkflowToolArg>
  runIdFromCaller: true
}

export const PROPOSE_SKILL_DECLARATION: SkillToolDeclaration = {
  name: PROPOSE_SKILL_TOOL,
  description:
    'Propose a skill: written steps that agents follow for one kind of task. This is the only way to write or change a ' +
    'skill. Never write a skill folder into files yourself. A person reviews it, and no agent uses it until they ' +
    'accept or publish it. Use it when a person asks you to make something a skill, or to change one. ' +
    `Send SKILL.md and any other files the skill needs. At most ${MAX_SKILL_PROPOSALS_PER_RUN} proposals in one run. ` +
    'Answers whether it became the person\'s draft or a proposal waiting for review, and any warnings.',
  args: {
    name: { type: 'string', maxLength: 64, description: 'The skill\'s name: lowercase letters, digits and hyphens, such as checkout-review' },
    description: {
      type: 'string', maxLength: 1024,
      description: 'What the skill does and when to use it, in one or two sentences, such as "Review a checkout change. Use when a change touches src/checkout."',
    },
    files: {
      type: 'stringMap',
      description: 'Each file\'s path in the skill\'s folder, mapped to its text. SKILL.md is required: front matter with name and description, then the steps. Add scripts/ or references/ files only if SKILL.md names them',
    },
    why: { type: 'string', maxLength: 2000, description: 'Why you propose it, in one or two sentences, for the person who reviews it' },
    aim: {
      type: 'string', maxLength: 20,
      description: 'Who it is for: project (every agent in this project), organisation (the organisation\'s Library), or person (the person you work for, in their own conversations)',
    },
    edits: {
      type: 'string', optional: true, maxLength: 200,
      description: 'Only to change an existing skill: its name in the Library as publisher/name, or its folder name in this place. Leave it out for a new skill',
    },
  },
  runIdFromCaller: true,
}
