/**
 * A conversation's skills on OpenCode (spec §7, adr-0084).
 *
 * At the start of each turn the site stages the run's skills with the same
 * code, namespaces and checks as for Claude (`stageSkills`), into one folder
 * per conversation inside the runner's Claude home's staging folder, which the
 * container binds read-only. The turn's system prompt lists each skill's name
 * and description in the words and format of OpenCode's own list; Agenthix's
 * plugin replaces OpenCode's `skill` tool and loads only from this folder, and
 * lets the conversation's commands read it. OpenCode's own skill discovery is
 * never used.
 *
 * A turn restages the whole folder, so a skill changed between turns is what
 * the next turn sees. The folder goes with the conversation's staging when the
 * conversation goes idle or ends (conversation lifecycle).
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { OPENCODE_SKILLS_DIRNAME, conversationStagingDirName } from '@agenthix/core'
import { Logger } from '../../../server/utils/logger'
import { skillRootsFor, stageSkills } from '../skillStaging'
import { recordSkillsUsed } from '../skillUseRecord'
import { SKILLS_STAGING_DIRNAME } from '../skillsStagingDir'
import type { RunContext } from '../types'
import { skillDescription } from './skillDescription'

const logger = new Logger('OpenCodeSkills')

export type OpenCodeSkill = {
  name: string
  description: string | undefined
  /** The skill's SKILL.md as the run sees it. */
  location: string
}

export type OpenCodeTurnSkills = {
  skills: OpenCodeSkill[]
  /** The section for the turn's `system` field, or null when no skill was staged. */
  systemSection: string | null
}

type StagingContext = Pick<RunContext, 'runId' | 'claudeHome' | 'packages' | 'boundaryOverride' | 'boundarySharedSkills'>

function stagingDirName(conversationId: string): string {
  const name = conversationStagingDirName(conversationId)
  if (!name) throw new Error(`Refusing to stage skills for an unexpected conversation id: ${JSON.stringify(conversationId)}`)
  return name
}

/** The conversation's skills folder: `{ serverDir }` where the site writes it, `{ visibleDir }` as the run sees it. */
export function openCodeSkillsDirs(claudeHome: RunContext['claudeHome'], conversationId: string) {
  const suffix = path.join(SKILLS_STAGING_DIRNAME, stagingDirName(conversationId), OPENCODE_SKILLS_DIRNAME)
  return {
    serverDir: path.join(claudeHome.serverDir, suffix),
    visibleDir: path.posix.join(claudeHome.visibleDir, suffix.split(path.sep).join('/')),
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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
          `    <description>${s.description}</description>`,
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

/**
 * Stages this turn's skills for the conversation, replacing what an earlier
 * turn staged, and returns them with the system prompt's section. The new set
 * is staged beside the old and swapped in by renames, so the folder is never
 * seen half-written.
 */
export async function stageOpenCodeSkills(context: StagingContext, conversationId: string): Promise<OpenCodeTurnSkills> {
  const dirs = openCodeSkillsDirs(context.claudeHome, conversationId)
  const parent = path.dirname(dirs.serverDir)
  await fs.mkdir(parent, { recursive: true })
  const next = path.join(parent, `${OPENCODE_SKILLS_DIRNAME}.next-${randomUUID()}`)
  const old = path.join(parent, `${OPENCODE_SKILLS_DIRNAME}.old-${randomUUID()}`)
  await fs.mkdir(next)

  let staged
  try {
    staged = await stageSkills(skillRootsFor(context.packages, context.boundaryOverride, context.boundarySharedSkills), next)
    await fs.rename(dirs.serverDir, old).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err
    })
    await fs.rename(next, dirs.serverDir)
  } catch (err) {
    await fs.rm(next, { recursive: true, force: true }).catch(() => {})
    throw err
  } finally {
    await fs.rm(old, { recursive: true, force: true }).catch(() => {})
  }

  await recordSkillsUsed(context.runId, staged)
  const skills: OpenCodeSkill[] = []
  for (const s of staged) {
    const markdown = await fs.readFile(path.join(dirs.serverDir, s.name, 'SKILL.md'), 'utf-8').catch(() => null)
    if (markdown === null) continue
    skills.push({
      name: s.name,
      description: skillDescription(markdown),
      location: path.posix.join(dirs.visibleDir, s.name, 'SKILL.md'),
    })
  }
  if (skills.length > 0) logger.info(`[launch]   skills     = ${skills.map(s => s.name).join(', ')}`)
  return { skills, systemSection: skills.length > 0 ? openCodeSkillsSection(skills) : null }
}
