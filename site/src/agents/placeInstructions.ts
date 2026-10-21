/**
 * A place's instructions for every agent working in it: `AGENTS.md` at the top
 * of the project's or person's `files/`, put into every run's prompt.
 *
 * Every agent in the place can write that folder, through the run's mount of
 * the owner's whole storage — including replacing `files/` itself with a link.
 * So the file is read only when `files/` is a real directory where the layout
 * puts it and `AGENTS.md` is a regular file in it, not a link, opened once and
 * confirmed on the descriptor (`readFileNoFollow`). A file that fails any of
 * that is left out of the prompt rather than failing the run.
 */
import path from 'node:path'
import type { LocationRef } from '@agenthix/core'
import { getFilesDir, ownerDir } from '../server/storage/paths'
import { readFileNoFollow, realpathOrNull } from '../packages/boundaryOverrides'
import { Logger } from '../server/utils/logger'

const logger = new Logger('PlaceInstructions')

export const PLACE_INSTRUCTIONS_FILE = 'AGENTS.md'

/** Generous for instructions, and a bound on what every prompt in the place carries. */
export const PLACE_INSTRUCTIONS_MAX_BYTES = 128 * 1024

export async function readPlaceInstructions(loc: Pick<LocationRef, 'ownerType' | 'ownerId'>): Promise<string | null> {
  const filesHome = getFilesDir(loc.ownerType, loc.ownerId)
  const [realOwner, realHome] = await Promise.all([
    realpathOrNull(ownerDir(loc.ownerType, loc.ownerId)),
    realpathOrNull(filesHome),
  ])
  if (!realOwner || !realHome || realHome !== path.join(realOwner, path.basename(filesHome))) return null
  const file = path.join(realHome, PLACE_INSTRUCTIONS_FILE)

  const result = await readFileNoFollow(file, { sandboxHome: realHome, maxBytes: PLACE_INSTRUCTIONS_MAX_BYTES })
  if (!result.ok) {
    if (result.reason !== 'missing') {
      logger.warn(`${loc.ownerType} ${loc.ownerId}: ${PLACE_INSTRUCTIONS_FILE} left out of the prompt (${result.reason})`)
    }
    return null
  }
  return result.buf.toString('utf-8').trim() || null
}
