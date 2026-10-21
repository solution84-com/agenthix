/**
 * The plugin's `skill`, in place of OpenCode's (spec §7, adr-0084).
 *
 * OpenCode discovers skills once per project folder into one pool shared by
 * every session, so on a server shared by several agents two agents' skills of
 * one name cannot both exist, and a changed skill waits for a reload that
 * cancels every running turn. Agenthix instead stages each conversation's
 * skills per turn, lists them in the turn's own system prompt, and this tool
 * loads one from the calling conversation's staged folder and nowhere else.
 * The call passes the gate like every other, with the skill's name as its
 * argument. Its description and output are OpenCode's own (v1.18.32,
 * `tool/skill.ts`).
 *
 * How skills reach each runtime is written up in `docs/concepts/skills/`.
 */
import path from 'node:path'
import { HARNESS_GATE_UNAVAILABLE, openCodeSkillsContainerDir } from '@agenthix/core'
import { tool, type ToolContext, type ToolResult } from '@opencode-ai/plugin/tool'
import { parseArgs } from './files/common'
import { SKILL_DESCRIPTION } from './files/descriptions'
import { closeQuietly, listFolder, openForRead, readAll, type FdPaths } from './files/verifiedFs'
import type { SiteClient } from './site'

const z = tool.schema
const args = { name: z.string().describe('The name of the skill from available_skills') }
const schema = z.object(args)

const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX_FILES = 10

/** The instructions of a `SKILL.md`: everything after its front matter, as OpenCode's parser gives it. */
export function skillBody(markdown: string): string {
  const text = markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown
  const open = text.match(/^---[^\S\r\n]*\r?\n/)
  if (!open) return text
  const close = /\r?\n---[^\S\r\n]*(?:\r?\n|$)/g
  close.lastIndex = open[0].length - 1
  const found = close.exec(text)
  return found ? text.slice(found.index + found[0].length) : text
}

function folderNames(sys: FdPaths, dir: string): string[] {
  try {
    const opened = openForRead(sys, dir)
    try {
      return listFolder(sys, opened.fd).filter(e => e.isDirectory()).map(e => e.name).sort()
    } finally {
      closeQuietly(opened.fd)
    }
  } catch {
    return []
  }
}

/** Up to ten files of a skill other than its SKILL.md, links left alone, as OpenCode samples them. */
function sampleFiles(sys: FdPaths, dir: string): string[] {
  const files: string[] = []
  const queue = [dir]
  while (queue.length > 0 && files.length < MAX_FILES) {
    const current = queue.shift() as string
    let entries
    try {
      const opened = openForRead(sys, current)
      try {
        entries = listFolder(sys, opened.fd)
      } finally {
        closeQuietly(opened.fd)
      }
    } catch {
      continue
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (entry.isFile() && entry.name !== 'SKILL.md' && files.length < MAX_FILES) files.push(full)
    }
  }
  return files
}

export function skillTool(
  sys: FdPaths,
  site: SiteClient | null,
  skillsDirFor: (conversationId: string) => string | null = openCodeSkillsContainerDir,
) {
  return tool({
    description: SKILL_DESCRIPTION,
    args,
    async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { name } = parseArgs('skill', schema, raw)
      const turn = site ? await site.turn(ctx.sessionID) : null
      const root = turn ? skillsDirFor(turn.conversationId) : null
      if (!root) throw new Error(HARNESS_GATE_UNAVAILABLE)

      const available = folderNames(sys, root)
      if (!SKILL_NAME.test(name) || !available.includes(name)) {
        throw new Error(`Skill "${name}" not found. Available skills: ${available.join(', ') || 'none'}`)
      }
      const dir = path.join(root, name)
      const opened = openForRead(sys, path.join(dir, 'SKILL.md'))
      let body: string
      try {
        body = skillBody(readAll(opened.fd).toString('utf-8'))
      } finally {
        closeQuietly(opened.fd)
      }

      await ctx.ask({ permission: 'skill', patterns: [name], always: [name], metadata: {} })

      return {
        title: `Loaded skill: ${name}`,
        output: [
          `<skill_content name="${name}">`,
          `# Skill: ${name}`,
          '',
          body.trim(),
          '',
          `Base directory for this skill: ${dir}`,
          'Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.',
          'Note: file list is sampled.',
          '',
          '<skill_files>',
          sampleFiles(sys, dir).map(file => `<file>${file}</file>`).join('\n'),
          '</skill_files>',
          '</skill_content>',
        ].join('\n'),
        metadata: { name, dir },
      }
    },
  })
}
