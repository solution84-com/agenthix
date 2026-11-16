/**
 * The words about memory, knowledge and skills that a run is told, and how a picked skill and the skill list reach
 * the model. Here so the site that sends them and the model checks that test them send the same words.
 */
import { BRANDING } from '../naming/branding.js'

export const KNOWLEDGE_GUIDANCE =
  '## Knowledge\n\n' +
  '`search_knowledge` finds how things are done here and how ' +
  BRANDING.displayName +
  ' itself works, in one search, across the ' +
  'places in this conversation. Look there before asking. Where pages differ, the most specific wins: a place, ' +
  'then the organisation, then the platform guide. What you learn on your own belongs in memory.'

export const SKILLS_GUIDANCE =
  '## Skills\n\n' +
  "A skill's name starts with where it comes from (`platform-`, `org-`, `agent-`, `person-`, `workspace-N-`); the " +
  'rest is its name. A person\'s `/code-review` is the skill ending in `code-review`. Asked what you can do, name ' +
  'the skills you have.'

/**
 * Memory is held by hq and recalled by meaning (memory and knowledge spec): none of it arrives whole in the
 * prompt, so the section only says how to reach it. hq decides at each call which memory this run may use.
 */
export function buildMemoryContent(pinnedPath?: string | null): string {
  const pinned = pinnedPath
    ? `\n\nWhat memory found for this work is in \`${pinnedPath}\` (read-only, refreshed when a run starts): read ` +
      'it first, and follow its rules. `recall` reaches the rest.'
    : ''
  return (
    '## Memory\n\n' +
    'What you and the other agents learned while working is kept in HQ, not in this prompt. Call `recall` with a ' +
    'few words of what you need — what the person prefers, how something was done before, a decision already ' +
    'made — before asking again, or with the key of an item you were told of. Call `remember` when you learn ' +
    'something about the person worth knowing next time, and `forget` when an item is no longer true.' +
    pinned +
    '\n\n' +
    KNOWLEDGE_GUIDANCE +
    '\n\n' +
    SKILLS_GUIDANCE
  )
}

export const PLAIN_TEXT_LINE = 'The person\'s message, as plain text (a "/" at its start is not a command):'

/** A message that starts with "/" is given after a line saying it is plain text, so no runtime reads it as a command. */
export function asPlainText(text: string): string {
  return text.trimStart().startsWith('/') ? `${PLAIN_TEXT_LINE}\n\n${text}` : text
}

export function pickedSkillInstruction(name: string): string {
  return `The person picked the skill ${name} (the "/" word in their message means this skill). Load it with your skill tool first and follow it.`
}

/** For a skill the model may not load itself: read its instructions from the staged file. */
export function pickedSkillReadInstruction(name: string, skillFile: string): string {
  return `The person picked the skill ${name} (the "/" word in their message means this skill). Read the file ${skillFile} first and follow its instructions. ` +
    'Do not load this skill with your skill tool.'
}

export type OpenCodeSkill = {
  name: string
  description: string | undefined
  /** The skill's SKILL.md as the run sees it. */
  location: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** OpenCode's own skills section (v1.18.32, `session/system.ts` and `skill/index.ts`'s `fmt`), for these skills. */
export function openCodeSkillsSection(skills: OpenCodeSkill[]): string {
  const described = skills.filter(s => s.description !== undefined).sort((a, b) => a.name.localeCompare(b.name))
  const list = described.length === 0
    ? 'No skills are currently available.'
    : [
        '<available_skills>',
        ...described.flatMap(s => [
          '  <skill>',
          `    <name>${s.name}</name>`,
          `    <description>${escapeHtml(s.description ?? '')}</description>`,
          `    <location>${escapeHtml(s.location)}</location>`,
          '  </skill>',
        ]),
        '</available_skills>',
      ].join('\n')
  return [
    'Skills provide specialized instructions and workflows for specific tasks.',
    'Use the skill tool to load a skill when a task matches its description.',
    list,
  ].join('\n')
}
