// The site's skill staging and message handling, run in this test process from the site's own code, for what the
// harness cannot reach through a running site: a run on this tier fails at launch (no agent image, no credential), so
// no turn ever starts a harness to stage skills or build its message. Everything the code under test needs is the
// site's own: its package cache and its files under the SITE_ROOT the running site uses (so content hq really
// delivered over the channel is what is staged), its database (so the run's record of skills used is written to the
// row the dispatch made), and the functions both runtimes call at the start of a turn (claudeSkills.ts,
// openCodeSkills.ts, pickedSkill.ts). Only two things are the harness's: the staging folder is a temporary one, and
// the run's container is not started.
//
// Loaded on first use, after the apps are up: it points DATABASE_URL at the site's test database for the site's own
// database client, and the apps are started with their own explicit settings (apps.ts), never from this process.
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SITE_ROOT_DIR, SITE_TEST_DATABASE_URL } from './env'
import type { RunSkillInputs } from '../../../site/src/agents/runtime/skillSources'
import type { InvocableSkill } from '../../../site/src/agents/runtime/pickedSkill'
import type { RunContext } from '../../../site/src/agents/runtime/types'

export type { RunSkillInputs, InvocableSkill }

async function load() {
  process.env.SITE_ROOT = SITE_ROOT_DIR
  process.env.DATABASE_URL = SITE_TEST_DATABASE_URL
  const [claude, openCode, picked, paths] = await Promise.all([
    import('../../../site/src/agents/runtime/claude/claudeSkills'),
    import('../../../site/src/agents/runtime/opencode/openCodeSkills'),
    import('../../../site/src/agents/runtime/pickedSkill'),
    import('../../../site/src/server/storage/paths'),
  ])
  return { claude, openCode, picked, paths }
}

let loaded: ReturnType<typeof load> | null = null
const site = () => (loaded ??= load())

/** An empty platform package folder: the platform's own `skills/` is not what these scenarios are about. */
const platformDir = mkdtempSync(join(SITE_ROOT_DIR, 'crossapp-platform-'))

function claudeHome(): { serverDir: string; visibleDir: string } {
  const serverDir = mkdtempSync(join(SITE_ROOT_DIR, 'crossapp-claude-home-'))
  mkdirSync(serverDir, { recursive: true })
  return { serverDir, visibleDir: '/home/agent/.claude' }
}

/** A turn's skills as one runtime staged them, and the message that runtime would be given. */
export type StagedTurn = {
  names: string[]
  invocable: InvocableSkill[]
  /** The message as this runtime gives it to the harness. */
  prompt: (text: string, pickedSkill?: string) => string
}

function turnOf(names: string[], invocable: InvocableSkill[], turnPrompt: (c: { prompt: string; pickedSkill?: string; runId: string }, s: readonly InvocableSkill[]) => string, runId: string): StagedTurn {
  return { names, invocable, prompt: (text, pickedSkill) => turnPrompt({ prompt: text, pickedSkill, runId }, invocable) }
}

/**
 * The Claude runtime's start of a turn for `runId` (a run the site really holds, so its record of skills used is
 * written to it): stages what hq named, and gives the message the way the runtime does.
 */
export async function claudeTurn(runId: string, skills: RunSkillInputs | null): Promise<StagedTurn> {
  const { claude, picked } = await site()
  const context = { runId, claudeHome: claudeHome(), packages: { platformDir }, skills } as unknown as RunContext
  const staged = await claude.stageTurnSkills(context)
  return turnOf(staged?.names ?? [], staged?.invocable ?? [], picked.turnPrompt, runId)
}

/** The OpenCode runtime's start of a turn, the same way. */
export async function openCodeTurn(runId: string, skills: RunSkillInputs | null): Promise<StagedTurn> {
  const { openCode, picked } = await site()
  const context = { runId, claudeHome: claudeHome(), packages: { platformDir }, skills }
  const staged = await openCode.stageOpenCodeSkills(context as Parameters<typeof openCode.stageOpenCodeSkills>[0], randomUUID())
  return turnOf(staged.skills.map(s => s.name), staged.invocable, picked.turnPrompt, runId)
}

/** The plain-text line that stands before a message that starts with `/`. */
export async function plainTextLine(): Promise<string> {
  return (await site()).picked.PLAIN_TEXT_LINE
}

/** Where the site keeps a place's files on disk, for a change made outside HQ (an agent's file tools, anyone writing the folder). */
export async function placeFilesDir(ownerType: 'project' | 'user', ownerId: string): Promise<string> {
  return (await site()).paths.getFilesDir(ownerType, ownerId)
}
