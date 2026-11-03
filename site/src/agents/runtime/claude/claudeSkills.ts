/**
 * A turn's skills for a Claude process (adr-0084): staged afresh at the start
 * of every turn, and compared by content with what the running process was
 * started with, since a `claude` process reads its skills once, at start.
 *
 * Staged inside the boundary's Claude home — the directory bound into the
 * run's container — under `.tmp/skills-<random>/.claude/skills`, and bound
 * again read-only there (`boundarySkillsStagingBind`), so what is staged
 * cannot be rewritten from inside the container. Created through the site's
 * own view of that directory; the process is told the run-visible one.
 *
 * The `.claude` folder is a local Claude Code plugin (`.claude-plugin/plugin.json`
 * beside `skills/`), because Claude Code loads skills from a plugin whatever
 * its setting sources, and from an added directory only with the project's
 * settings on — which would also load settings, hooks and skills from the
 * agent-writable working tree. The process runs with no setting sources, so
 * the plugin is its only source of skills besides its own bundled ones, which
 * the `skills` allowlist hides.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Logger } from '../../../server/utils/logger'
import { stageSkills, type StagingResult } from '../skillStaging'
import {
  closeDir, inDir, lstatIn, namesIn, openFolderIn, readFileUnder, removeFromStaging, withStagingFolder, writeNewFileUnder, type Dir,
} from '../homeFolder'
import { SKILL_FILE } from '../skillTree'
import { recordSkillsUsed } from '../skillUseRecord'
import { SKILLS_STAGING_DIRNAME } from '../skillsStagingDir'
import { SKILLS_PLUGIN_NAME } from '../sdkNames'
import type { RunContext } from '../types'
import type { InvocableSkill } from '../pickedSkill'

const logger = new Logger('ClaudeSDKRuntime')

const PLUGIN_DIRNAME = '.claude'
const PLUGIN_MANIFEST = JSON.stringify({ name: SKILLS_PLUGIN_NAME })

export type StagedTurnSkills = {
  /** The staging folder as this process sees it — removed when no process uses it. */
  serverDir: string
  /** The same folder as the `claude` process sees it. */
  visibleDir: string
  /** The plugin root inside it, as the `claude` process sees it. */
  visiblePluginDir: string
  /** The staged skills' names, as the model calls them. */
  names: string[]
  /** Each staged skill as a person's pick is checked and told to the model (pickedSkill.ts), its file in this folder. */
  invocable: InvocableSkill[]
  /** The staged content, so an unchanged set keeps the running process. */
  hash: string
}

/** Stages the turn's skills, or returns null when no source has any. */
export async function stageTurnSkills(context: RunContext): Promise<StagedTurnSkills | null> {
  // Through the staging folder as opened from the harness home, never by path (homeFolder.ts): a `.claude` or
  // `.tmp` the run replaced with a link is refused, and nothing is written or read through one.
  const staged = await withStagingFolder(context.claudeHome.serverDir, async tmp => {
    const name = path.basename(await fs.mkdtemp(inDir(tmp, 'skills-')))
    const folder = await openFolderIn(tmp, name)
    try {
      const plugin = await openFolderIn(folder, PLUGIN_DIRNAME)
      try {
        const skills = await openFolderIn(plugin, 'skills')
        let result: StagingResult
        try {
          result = await stageSkills(context.skills, skills)
        } finally {
          await closeDir(skills)
        }
        await recordSkillsUsed(context.runId, result)
        if (result.staged.length === 0) return { name, result, hash: '' }
        await writeNewFileUnder(plugin, '.claude-plugin/plugin.json', PLUGIN_MANIFEST)
        // A tree that cannot be read back counts as changed: it replaces the process.
        const hash = await hashTree(plugin).catch(() => `unread:${name}`)
        return { name, result, hash }
      } finally {
        await closeDir(plugin)
      }
    } finally {
      await closeDir(folder)
    }
  }, { create: true })

  const serverDir = path.join(context.claudeHome.serverDir, SKILLS_STAGING_DIRNAME, staged.name)
  if (staged.result.staged.length === 0) {
    await removeStagedSkills(serverDir)
    return null
  }
  const names = staged.result.staged.map(s => s.name)
  logger.info(`[launch]   skills     = ${names.join(', ')}`)
  // Re-rooted onto the run-visible view by slicing off the shared prefix,
  // never a string replace: an id that recurs elsewhere in the path would be
  // rewritten too. Both views name one directory, and the folder was built
  // from `serverDir`, so what follows it is the same under either view.
  const visibleDir = context.claudeHome.visibleDir + serverDir.slice(context.claudeHome.serverDir.length)
  const visiblePluginDir = path.posix.join(visibleDir, PLUGIN_DIRNAME)
  return {
    serverDir,
    visibleDir,
    visiblePluginDir,
    names,
    invocable: staged.result.staged.map(s => ({
      name: s.name,
      userInvocable: s.userInvocable,
      modelInvocable: s.modelInvocable,
      skillFile: path.posix.join(visiblePluginDir, 'skills', s.name, SKILL_FILE),
    })),
    hash: staged.hash,
  }
}

export async function removeStagedSkills(serverDir: string): Promise<void> {
  await removeFromStaging(serverDir).catch(() => {})
}

/** Every file's path and content, in a fixed order, read through the open folders. Staging copies files and makes no links. */
async function hashTree(root: Dir): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (dir: Dir, rel: string): Promise<void> => {
    for (const name of await namesIn(dir)) {
      const entryRel = rel ? path.join(rel, name) : name
      const entry = await lstatIn(dir, name)
      if (entry?.isDirectory()) {
        hash.update(`d:${entryRel}\0`)
        const child = await openFolderIn(dir, name)
        try {
          await walk(child, entryRel)
        } finally {
          await closeDir(child)
        }
      } else if (entry?.isFile()) {
        hash.update(`f:${entryRel}\0`)
        hash.update(await readFileUnder(dir, name))
        hash.update('\0')
      }
    }
  }
  await walk(root, '')
  return hash.digest('hex')
}
