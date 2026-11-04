/**
 * A run's pinned memory as a file (memory and knowledge spec, Workers and helpers). hq sends the pinned items the run
 * may read; the site writes them at every run start into the `pinned-memory/` folder of the runner's run staging
 * (runStaging.ts, adr-0173), which the container mounts read-only outside the harness home, so the run, and the
 * helpers that share its runner, can read them and cannot change them. Memory itself stays in hq: a change goes
 * through `remember`.
 *
 * One file for the session, `pinned-memory/<session id>/pinned.md`, replaced whole each start, removed when the run
 * has none and when the run ends. Whatever a run the site never saw end left behind goes at the next start for the
 * runner. Every run of the runner can read every file in it. A project's own runs are shared by the task runs of
 * every member of the project, so nothing about a person is written there: those runs reach the person's items with
 * `recall`, which hq answers for that person alone.
 */
import path from 'node:path'
import type { CapabilityRunner, PinnedMemoryItem } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { RUN_STAGING_PINNED_MEMORY } from './runStagingFolders'
import { closeDir, namesIn, openFolderIn, removeEntryIn, withRunStaging, writeFileAtomicInDir, type Dir } from './homeFolder'

const logger = new Logger('PinnedMemory')

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/
const SESSION_FOLDER = /^([A-Za-z0-9_-]{1,128})$/
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

/** Whether a runner's runs are for more than one person: the project's own, for its tasks. */
export function homeIsShared(runner: CapabilityRunner): boolean {
  return runner.kind === 'project'
}

/** Runs of each session going for each run staging, counted from their start to their end in this process. */
const running = new Map<string, Map<string, number>>()

function enter(stagingDir: string, sessionId: string): void {
  const sessions = running.get(stagingDir) ?? new Map<string, number>()
  sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1)
  running.set(stagingDir, sessions)
}

/** Counts the run out; true when no run of the session is left in the home. */
function leave(stagingDir: string, sessionId: string): boolean {
  const sessions = running.get(stagingDir)
  const left = (sessions?.get(sessionId) ?? 1) - 1
  if (!sessions) return true
  if (left > 0) {
    sessions.set(sessionId, left)
    return false
  }
  sessions.delete(sessionId)
  if (sessions.size === 0) running.delete(stagingDir)
  return true
}

/** Removes the folders of sessions with no run going for this runner, which only a run that never ended leaves. */
async function clearLeftBehind(stagingDir: string, staging: Dir): Promise<void> {
  for (const entry of await namesIn(staging)) {
    const session = SESSION_FOLDER.exec(entry)?.[1]
    if (session && !running.get(stagingDir)?.has(session)) await removeEntryIn(staging, entry)
  }
}

function folderName(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('Refusing a pinned memory folder for an unexpected session id')
  return sessionId
}

/**
 * Writes the run's pinned memory, or removes what an earlier start wrote when there is none, and counts the run
 * into the run staging until `releasePinnedMemory`, which every call must be matched by. Returns the file's path as the
 * run sees it, or null when there is no file. Never throws: a run without its pinned memory still has `recall`.
 */
export async function writePinnedMemory(
  runStaging: { serverDir: string; visibleDir: string; shared: boolean },
  sessionId: string,
  pinned: PinnedMemoryItem[] | undefined,
): Promise<string | null> {
  // Counted before anything is awaited, so a start for the same runner never takes this run's folder for one left behind.
  enter(runStaging.serverDir, sessionId)
  try {
    const name = folderName(sessionId)
    const items = runStaging.shared ? pinned?.filter(item => item.scope === 'agent_place') : pinned
    const none = !items || items.length === 0
    const written = await withRunStaging(runStaging.serverDir, RUN_STAGING_PINNED_MEMORY, async staging => {
      await clearLeftBehind(runStaging.serverDir, staging)
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
      runStaging.visibleDir.split(path.sep).join('/'), RUN_STAGING_PINNED_MEMORY, name, PINNED_MEMORY_FILENAME,
    )
  } catch (err) {
    logger.warn(`Could not write the pinned memory: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** At the run's end: its folder goes once no run of its session is left for the runner. Never throws. */
export async function releasePinnedMemory(stagingDir: string, sessionId: string): Promise<void> {
  if (!leave(stagingDir, sessionId) || !SESSION_ID.test(sessionId)) return
  try {
    await withRunStaging(stagingDir, RUN_STAGING_PINNED_MEMORY, staging => removeEntryIn(staging, folderName(sessionId)))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    logger.warn(`Could not remove the pinned memory: ${err instanceof Error ? err.message : String(err)}`)
  }
}
