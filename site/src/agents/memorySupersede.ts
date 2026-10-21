/**
 * ADR-0058 moved what an agent knows about a person to hq. Whatever is still on
 * this site's disk is moved aside here on boot.
 *
 * TWO locations, because there were two conventions:
 *
 *  - `agents/<handle>/users/<userId>` — ADR-0048's per-invoker partition, bound
 *    at `/memory` for person-invoked runs only. Superseded by this phase.
 *  - `agents/<handle>/workspace/.private/memory/users/<userId>` — what ADR-0048
 *    replaced. It sat INSIDE the agent's own working directory, which was
 *    bind-mounted `rw` into every run of that agent, so one person's memory left
 *    there was readable by every run, including runs invoked by someone else.
 *    That directory is gone and nothing mounts it any more, but an upgraded
 *    install still has whatever was written under it, so the sweep still runs.
 *    A one-time migration used to move it out; this sweep covers the path
 *    directly now that the migration is gone. Sweeping it is not housekeeping —
 *    it is the mitigation ADR-0048 was cut for.
 *
 * `.private/memory/projects/` is left where it is: project knowledge is about a
 * project, not about a person, and it was meant to be readable by the run.
 *
 * Nothing here is imported into hq. Either directory holds free-form text an
 * agent wrote, of no fixed size or shape; the store that replaces them holds
 * short curated items under a cap, which every future run's prompt then carries.
 * There is no person present at boot to accept an import, and importing
 * unreviewed would push arbitrary text into every one of that person's runs from
 * then on. Nothing is destroyed either: the files stay readable at their new
 * path, and anything worth keeping can be re-added from hq.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { Logger } from '../server/utils/logger'
import { WorkspaceService } from './agentDiskPaths'

const logger = new Logger('memorySupersede')

export const SUPERSEDED_MEMORY_DIRNAME = 'memory-superseded'

/**
 * Where a person's memory could still be sitting, and the name it is set aside
 * under. Two subdirectories rather than one flat one: the same userId can exist
 * in both places on an install that upgraded part-way, and an operator reading
 * the set-aside tree should be able to tell which convention a directory came
 * from without inferring it.
 */
const SUPERSEDED_SOURCES: { from: string[]; setAsideUnder: string }[] = [
  { from: ['users'], setAsideUnder: 'partition' },
  { from: ['workspace', '.private', 'memory', 'users'], setAsideUnder: 'in-workspace' },
]

/** Moves every surviving per-person directory aside, from both locations.
 *  Returns how many it moved in total. Throws if `handle` does not resolve
 *  inside the agents root — this only defends future callers; the one caller
 *  today already passes handles read from that same root. */
export async function setAsideSupersededMemory(handle: string): Promise<number> {
  const agentsRoot = WorkspaceService.getWorkspaceRoot()
  const agentDir = WorkspaceService.validatePath(path.join(agentsRoot, handle), agentsRoot, 'agent handle escaped the agents root')
  let moved = 0

  for (const source of SUPERSEDED_SOURCES) {
    const sourceDir = path.join(agentDir, ...source.from)

    let entries: string[]
    try {
      entries = await fs.readdir(sourceDir)
    } catch {
      continue // this convention was never used for this agent
    }

    const destDir = path.join(agentDir, SUPERSEDED_MEMORY_DIRNAME, source.setAsideUnder)

    for (const userId of entries) {
      // Per-person boundary: one permanently failing rename must not starve every
      // later person of this agent on every future boot.
      try {
        const from = path.join(sourceDir, userId)
        // lstat, not stat: a symlink must be skipped, not followed and swept as
        // though it were the person's own directory — listAgentHandles() next to
        // this module treats a symlink the same non-following way, and a rename
        // would leave the link itself relocated rather than resolving anything.
        const stat = await fs.lstat(from).catch(() => null)
        if (!stat?.isDirectory()) continue // a stray file, or a symlink, is not a person

        await fs.mkdir(destDir, { recursive: true })
        let to = path.join(destDir, userId)
        if (await fs.access(to).then(() => true).catch(() => false)) {
          // Something is already set aside under this id. Keep both — this sweep
          // destroys nothing and overwrites nothing.
          to = path.join(destDir, `${userId}-${Date.now()}`)
        }

        await fs.rename(from, to)
        moved++
        logger.info(`[memory] ${handle}: superseded memory set aside at ${to} — not imported; re-add anything still true from hq`)
      } catch (err) {
        const crossDevice = (err as NodeJS.ErrnoException)?.code === 'EXDEV'
        const detail = err instanceof Error ? err.message : String(err)
        if (crossDevice) {
          // A same-filesystem rename never fails this way. Left as a warning
          // this would read exactly like "there was nothing to move" — it is the
          // opposite: the directory is still sitting where ADR-0048 left it,
          // and needs an operator's attention.
          logger.error(`[memory] ${handle}: cross-device rename failed — ${userId} is still at ${sourceDir}, unresolved: ${detail}`)
        } else {
          logger.warn(`[memory] ${handle}: could not set aside ${userId} from ${sourceDir}: ${detail}`)
        }
      }
    }
  }

  return moved
}
