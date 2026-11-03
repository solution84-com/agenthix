/**
 * A run's pinned memory as a file in its home (memory and knowledge spec, Workers and helpers). hq sends the
 * pinned items the run may read; the site writes them at every run start into the staging folder of the runner's
 * Claude home — the folder the container binds read-only — so the run, and the helpers that share its home, can
 * read them and cannot change them. Memory itself stays in hq: a change goes through `remember`.
 *
 * One file for the session, `memory-<session id>/pinned.md`, replaced whole each start, removed when the run has
 * none and when the run ends. Whatever a run the site never saw end left behind goes at the next start in the
 * home. The container binds the whole staging folder, and every run of its runner can read every file in it.
 * A project's own home is shared by the task runs of every member of the project, so nothing about a person is
 * written there: those runs reach the person's items with `recall`, which hq answers for that person alone.
 */
import path from 'node:path'
import type { CapabilityRunner, PinnedMemoryItem } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { SKILLS_STAGING_DIRNAME } from './skillsStagingDir'
import { closeDir, namesIn, openFolderIn, removeEntryIn, withStagingFolder, writeFileAtomicInDir, type Dir } from './homeFolder'

const logger = new Logger('PinnedMemory')

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/
const SESSION_FOLDER = /^memory-([A-Za-z0-9_-]{1,128})$/
export const PINNED_MEMORY_FILENAME = 'pinned.md'

const SCOPE_LABEL: Record<PinnedMemoryItem['scope'], string> = {
  person: 'about the person, for every agent',
  agent_person: 'about the person, for you',
  agent_place: 'about this place, for you',
}

export function pinnedMemoryText(items: PinnedMemoryItem[]): string {
  const entries = items.map(item =>
    `## ${item.title}\n\n_${SCOPE_LABEL[item.scope]} · key \`${item.key}\`_\n\n${item.body.trim()}`)
  return (
    '# Pinned memory\n\n' +
    'Read-only. These items are kept in HQ and refreshed each time a run starts. `recall` finds the rest; ' +
    '`remember` and `forget` change them.\n\n' +
    entries.join('\n\n')
  ) + '\n'
}

/** Whether a runner's home is run in for more than one person: the project's own, for its tasks. */
export function homeIsShared(runner: CapabilityRunner): boolean {
  return runner.kind === 'project'
}

/** Runs of each session going in each home, counted from their start to their end in this process. */
const running = new Map<string, Map<string, number>>()

function enter(claudeHomeDir: string, sessionId: string): void {
  const sessions = running.get(claudeHomeDir) ?? new Map<string, number>()
  sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1)
  running.set(claudeHomeDir, sessions)
}

/** Counts the run out; true when no run of the session is left in the home. */
function leave(claudeHomeDir: string, sessionId: string): boolean {
  const sessions = running.get(claudeHomeDir)
  const left = (sessions?.get(sessionId) ?? 1) - 1
  if (!sessions) return true
  if (left > 0) {
    sessions.set(sessionId, left)
    return false
  }
  sessions.delete(sessionId)
  if (sessions.size === 0) running.delete(claudeHomeDir)
  return true
}

/** Removes the folders of sessions with no run going in this home, which only a run that never ended leaves. */
async function clearLeftBehind(claudeHomeDir: string, staging: Dir): Promise<void> {
  for (const entry of await namesIn(staging)) {
    const session = SESSION_FOLDER.exec(entry)?.[1]
    if (session && !running.get(claudeHomeDir)?.has(session)) await removeEntryIn(staging, entry)
  }
}

function folderName(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('Refusing a pinned memory folder for an unexpected session id')
  return `memory-${sessionId}`
}

/**
 * Writes the run's pinned memory, or removes what an earlier start wrote when there is none, and counts the run
 * into the home until `releasePinnedMemory`, which every call must be matched by. Returns the file's path as the
 * run sees it, or null when there is no file. Never throws: a run without its pinned memory still has `recall`.
 */
export async function writePinnedMemory(
  claudeHome: { serverDir: string; visibleDir: string; shared: boolean },
  sessionId: string,
  pinned: PinnedMemoryItem[] | undefined,
): Promise<string | null> {
  // Counted before anything is awaited, so a start in the same home never takes this run's folder for one left behind.
  enter(claudeHome.serverDir, sessionId)
  try {
    const name = folderName(sessionId)
    const items = claudeHome.shared ? pinned?.filter(item => item.scope === 'agent_place') : pinned
    // Inside the staging folder as opened from the harness home: a `.claude` or `.tmp` the run replaced with a link
    // is refused, never written through (homeFolder.ts).
    const none = !items || items.length === 0
    const written = await withStagingFolder(claudeHome.serverDir, async staging => {
      await clearLeftBehind(claudeHome.serverDir, staging)
      if (none) {
        await removeEntryIn(staging, name)
        return false
      }
      const dir = await openFolderIn(staging, name)
      try {
        await writeFileAtomicInDir(dir, PINNED_MEMORY_FILENAME, pinnedMemoryText(items), 0o644)
      } finally {
        await closeDir(dir)
      }
      return true
    }, { create: !none }).catch((err: NodeJS.ErrnoException) => {
      if (none && err.code === 'ENOENT') return false
      throw err
    })
    if (!written) return null
    return path.posix.join(
      claudeHome.visibleDir.split(path.sep).join('/'), SKILLS_STAGING_DIRNAME, name, PINNED_MEMORY_FILENAME,
    )
  } catch (err) {
    logger.warn(`Could not write the pinned memory: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** At the run's end: its folder goes once no run of its session is left in the home. Never throws. */
export async function releasePinnedMemory(claudeHomeDir: string, sessionId: string): Promise<void> {
  if (!leave(claudeHomeDir, sessionId) || !SESSION_ID.test(sessionId)) return
  try {
    await withStagingFolder(claudeHomeDir, staging => removeEntryIn(staging, folderName(sessionId)))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    logger.warn(`Could not remove the pinned memory: ${err instanceof Error ? err.message : String(err)}`)
  }
}
