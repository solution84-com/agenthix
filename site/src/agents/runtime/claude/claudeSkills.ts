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
import { stageSkills } from '../skillStaging'
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
  const tmpBase = path.join(context.claudeHome.serverDir, SKILLS_STAGING_DIRNAME)
  await fs.mkdir(tmpBase, { recursive: true })
  const serverDir = await fs.mkdtemp(path.join(tmpBase, 'skills-'))
  const pluginDir = path.join(serverDir, PLUGIN_DIRNAME)
  const skillsDir = path.join(pluginDir, 'skills')
  await fs.mkdir(skillsDir, { recursive: true })

  const result = await stageSkills(context.skills, skillsDir)
  await recordSkillsUsed(context.runId, result)
  const staged = result.staged
  if (staged.length === 0) {
    await removeStagedSkills(serverDir)
    return null
  }
  await fs.mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true })
  await fs.writeFile(path.join(pluginDir, '.claude-plugin', 'plugin.json'), PLUGIN_MANIFEST)
  logger.info(`[launch]   skills     = ${staged.map(s => s.name).join(', ')}`)
  // Re-rooted onto the run-visible view by slicing off the shared prefix,
  // never a string replace: an id that recurs elsewhere in the path would be
  // rewritten too. Both views name one directory, and the folder was built
  // from `serverDir`, so what follows it is the same under either view.
  const visibleDir = context.claudeHome.visibleDir + serverDir.slice(context.claudeHome.serverDir.length)
  // A tree that cannot be read back counts as changed: it replaces the process.
  const hash = await hashTree(pluginDir).catch(() => `unread:${serverDir}`)
  const visiblePluginDir = path.posix.join(visibleDir, PLUGIN_DIRNAME)
  return {
    serverDir,
    visibleDir,
    visiblePluginDir,
    names: staged.map(s => s.name),
    invocable: staged.map(s => ({
      name: s.name,
      userInvocable: s.userInvocable,
      modelInvocable: s.modelInvocable,
      skillFile: path.posix.join(visiblePluginDir, 'skills', s.name, SKILL_FILE),
    })),
    hash,
  }
}

export async function removeStagedSkills(serverDir: string): Promise<void> {
  await fs.rm(serverDir, { recursive: true, force: true }).catch(() => {})
}

/** Every file's path and content, in a fixed order. Staging copies files and makes no links. */
async function hashTree(root: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (dir: string): Promise<void> => {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full)
      if (entry.isDirectory()) {
        hash.update(`d:${rel}\0`)
        await walk(full)
      } else if (entry.isFile()) {
        hash.update(`f:${rel}\0`)
        hash.update(await fs.readFile(full))
        hash.update('\0')
      }
    }
  }
  await walk(root)
  return hash.digest('hex')
}
