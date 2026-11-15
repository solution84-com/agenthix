/**
 * A run's memory as a file (memory and knowledge spec, Workers and helpers; ADR-0188). hq sends what memory found for
 * the run at its start (`memory`); the site writes it at every run start into the `pinned-memory/` folder of the
 * runner's run staging (runStaging.ts, adr-0173), which the container mounts read-only outside the harness home, so
 * the run, and the helpers that share its runner, can read it and cannot change it. Memory itself stays in hq: a change goes
 * through `remember`.
 *
 * One file for the session, `pinned-memory/<session id>/pinned.md`, replaced whole each start, removed when the run
 * has none and when the run ends. Whatever a run the site never saw end left behind goes at the next start for the
 * runner. Every run of the runner can read every file in it. A project's own runs are shared by the task runs of
 * every member of the project, so nothing about a person is written there: hq sends such a run no memory, and the
 * site writes none of `memory` there whatever it is sent.
 */
import path from 'node:path'
import type { CapabilityRunner, RunMemory } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { RUN_STAGING_PINNED_MEMORY } from './runStagingFolders'
import { closeDir, namesIn, openFolderIn, removeEntryIn, withRunStaging, writeFileAtomicInDir, type Dir } from './homeFolder'

const logger = new Logger('PinnedMemory')

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/
const SESSION_FOLDER = /^([A-Za-z0-9_-]{1,128})$/
export const PINNED_MEMORY_FILENAME = 'pinned.md'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** What memory found for the run, as the file says it: Rules named as such, then what to recall by key. */
export function runMemoryText(memory: RunMemory): string {
  const entries = memory.items.map(item =>
    `## ${oneLine(item.title)}\n\n_${item.kind === 'rule' ? 'Rule' : 'Fact'} · key \`${item.key}\`_\n\n${item.body.trim()}`)
  const hinted = memory.hinted.length > 0
    ? [`Possibly relevant (\`recall\` by key to read): ${memory.hinted.map(h => `${oneLine(h.title)} [\`${h.key}\`]`).join('; ')}`]
    : []
  return (
    '# Memory for this work\n\n' +
    'Read-only. Found in HQ when this run started, from what the run is about; a rule is how the person wants ' +
    'things done. `recall` finds the rest; `remember` and `forget` change memory.\n\n' +
    [...entries, ...hinted].join('\n\n')
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
 * Writes the run's memory, or removes what an earlier start wrote when there is none, and counts the run
 * into the run staging until `releasePinnedMemory`, which every call must be matched by. Returns the file's path as the
 * run sees it, or null when there is no file. Never throws: a run without its pinned memory still has `recall`.
 */
export async function writePinnedMemory(
  runStaging: { serverDir: string; visibleDir: string; shared: boolean },
  sessionId: string,
  memory: RunMemory | undefined,
): Promise<string | null> {
  // Counted before anything is awaited, so a start for the same runner never takes this run's folder for one left behind.
  enter(runStaging.serverDir, sessionId)
  try {
    const name = folderName(sessionId)
    const text = memoryFileText(runStaging.shared, memory)
    const none = text === null
    const written = await withRunStaging(runStaging.serverDir, RUN_STAGING_PINNED_MEMORY, async staging => {
      await clearLeftBehind(runStaging.serverDir, staging)
      if (text === null) {
        await removeEntryIn(staging, name)
        return false
      }
      const dir = await openFolderIn(staging, name)
      try {
        await writeFileAtomicInDir(dir, PINNED_MEMORY_FILENAME, text, 0o644)
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

/** The file's text, or null for none. A shared home gets nothing of a person's, so none of `memory`. */
function memoryFileText(shared: boolean, memory: RunMemory | undefined): string | null {
  if (!memory || shared || memory.items.length + memory.hinted.length === 0) return null
  return runMemoryText(memory)
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
