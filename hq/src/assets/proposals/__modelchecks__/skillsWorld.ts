/**
 * The skills checks' world: what a run on OpenCode is told about skills and offered, built from the shared words
 * (core's memory, knowledge and skills guidance, `PLATFORM_TOOLS_INSTRUCTIONS` and OpenCode's skill list) and hq's own
 * platform tool declarations, so a change to any of them is what the checks test. The site's identity and filesystem
 * sections are the site's own, which hq cannot import: a short frame stands for them.
 *
 * Three skills are staged: the built-in `platform-skill-creator` (its own `SKILL.md`, read from hq's image), an
 * organisation's `org-release-notes`, and a person's `person-code-review`, which only a person picks
 * (`disable-model-invocation: true`). The tools answer from a script, in the real tools' words; nothing reaches a
 * database, a site or a file.
 */
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  PLATFORM_TOOLS_INSTRUCTIONS, buildMemoryContent, openCodeSkillsContainerDir, openCodeSkillsSection,
  type OpenCodeSkill,
} from '@agenthix/core'
import type { LeadToolDefinition, PromptPart } from '../../../conversations/contract'
import { taskRunTools } from '../../../conversations/__modelchecks__/taskRun/setup'
import { PROPOSE_SKILL_TOOL } from '../types'

const CONVERSATION_ID = 'conv-skills-check'
const SKILLS_DIR = openCodeSkillsContainerDir(CONVERSATION_ID)!
const PROJECT_DIR = '/projects/website-rebuild/files'
const SKILL_CREATOR_FILE = path.resolve(__dirname, '../../../../assets/platform/skills/skill-creator/SKILL.md')

/** OpenCode's own `skill` tool description, as the site's plugin gives it. */
const SKILL_TOOL_DESCRIPTION =
  "Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.\n\n" +
  "Use this tool to inject the skill's instructions and resources into current conversation. The output may contain " +
  'detailed workflow guidance as well as references to scripts, files, etc in the same directory as the skill.\n\n' +
  'The skill name must match one of the skills listed in your system prompt.\n'

export interface WorldSkill {
  name: string
  description: string
  /** Whether the model may load it with its skill tool; false when only a person picks it. */
  modelInvocable: boolean
  /** The skill's `SKILL.md`. */
  text: string
}

const RELEASE_NOTES_DESCRIPTION = 'How we write release notes: what to include, in what order, and the tone. Use when asked for the notes of a release.'
const CODE_REVIEW_DESCRIPTION = 'The steps for reviewing a change. A person picks it.'

function skillCreator(): WorldSkill {
  const text = fs.readFileSync(SKILL_CREATOR_FILE, 'utf8')
  return { name: 'platform-skill-creator', description: text.match(/^description: (.*)$/m)?.[1] ?? '', modelInvocable: true, text }
}

export const SKILLS: readonly WorldSkill[] = [
  skillCreator(),
  {
    name: 'org-release-notes', description: RELEASE_NOTES_DESCRIPTION, modelInvocable: true,
    text: [
      '---', 'name: release-notes', `description: ${RELEASE_NOTES_DESCRIPTION}`, '---', '',
      '# Release notes', '',
      '1. Start with one sentence on what the release is for.',
      '2. List what changed under three headings: New, Changed, Fixed. Skip a heading with nothing under it.',
      '3. Write each item as what a person can now do, not as the code that changed.',
      '4. End with anything a person must do to upgrade.', '',
    ].join('\n'),
  },
  {
    name: 'person-code-review', description: CODE_REVIEW_DESCRIPTION, modelInvocable: false,
    text: [
      '---', 'name: code-review', `description: ${CODE_REVIEW_DESCRIPTION}`, 'disable-model-invocation: true', '---', '',
      '# Code review', '',
      '1. Read the change and its description.',
      '2. Run the tests.',
      '3. List what to fix, most important first.', '',
    ].join('\n'),
  },
]

export const skillFile = (name: string): string => `${SKILLS_DIR}/${name}/SKILL.md`

export function skillNamed(name: string): WorldSkill | undefined {
  return SKILLS.find(s => s.name === name)
}

function listed(): OpenCodeSkill[] {
  return SKILLS.map(s => ({ name: s.name, description: s.description, location: skillFile(s.name) }))
}

export function system(): PromptPart[] {
  return [
    {
      text: [
        'You are Ada, an agent working for a person in the project Website Rebuild.', '',
        '## Filesystem', '', `- **Working directory (cwd):** \`${PROJECT_DIR}\` — the project's files.`,
      ].join('\n'),
    },
    { text: buildMemoryContent() },
    { text: PLATFORM_TOOLS_INSTRUCTIONS },
    { text: openCodeSkillsSection(listed()) },
  ]
}

export const SKILL_TOOL = 'skill'
export const READ_TOOL = 'read_file'
export const WORK_TOOLS: ReadonlySet<string> = new Set(['write_file', 'edit_file', 'bash', PROPOSE_SKILL_TOOL])

/** The harness's file and command tools and every platform tool (`propose_skill` among them), and the skill tool. */
export function tools(): LeadToolDefinition[] {
  const skill: LeadToolDefinition = {
    name: SKILL_TOOL, description: SKILL_TOOL_DESCRIPTION,
    input: z.object({ name: z.string().describe('The name of the skill from available_skills') }),
  }
  return [skill, ...taskRunTools()]
}

function skillContent(skill: WorldSkill): string {
  const body = skill.text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  return [
    `<skill_content name="${skill.name}">`, `# Skill: ${skill.name}`, '', body, '',
    `Base directory for this skill: ${SKILLS_DIR}/${skill.name}`, '</skill_content>',
  ].join('\n')
}

/** What each tool answers, in the real tools' words. */
export function answer(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case SKILL_TOOL: {
      const wanted = String(input.name ?? '')
      const skill = skillNamed(wanted)
      if (!skill) return `Skill "${wanted}" not found. Available skills: ${SKILLS.map(s => s.name).join(', ')}`
      if (!skill.modelInvocable) return `Skill "${wanted}" is only for a person to pick; it cannot be loaded with the skill tool.`
      return skillContent(skill)
    }
    case READ_TOOL: {
      const wanted = String(input.file_path ?? '')
      const skill = SKILLS.find(s => skillFile(s.name) === wanted)
      return skill ? skill.text : { error: `File not found: ${wanted}` }
    }
    case 'write_file': return `File created successfully at: ${String(input.file_path)}`
    case 'edit_file': return { error: `File not found: ${String(input.file_path)}` }
    case 'bash': return ''
    case PROPOSE_SKILL_TOOL:
      return {
        landed: 'proposal', name: input.name, proposal: 'p-1', reviewers: "the project's administrators", warnings: [],
        note: "Proposed. The project's administrators review it; no agent uses it until they accept it.",
      }
    default: return { error: `${name} is not part of this check: nothing was done.` }
  }
}
