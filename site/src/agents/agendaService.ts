/**
 * Agenda Service
 * ==============
 * A person's agenda — the short list of what needs their input or decision —
 * held as a file on the disk of the boundary a run works in (close-out spec §6.1).
 *
 * It belongs to the PERSON, not to the agent, and there is one per person per
 * boundary rather than one per person per agent: in a project it sits in that
 * person's own area, which everyone with access to the project can read, and in
 * their own storage it is theirs alone. Whichever agent they work with in a
 * boundary reads and updates the same file.
 *
 * It used to sit at agents/<agentHandle>/agenda/@<userHandle>.md — a sibling of
 * the agent's workspace, and that workspace is the only directory a container
 * binds, so no run could open it and none ever wrote one. Inside the person's
 * own area it is inside a directory the run has mounted.
 */
import path from 'node:path'
import { AGENDA_FILE_NAME } from '@agenthix/core'
import { getFilesDir, getMemberDir, type LocationRef } from '../server/storage/paths'

/**
 * One name wherever the file lands. The run-visible path is built from this
 * same constant, so what the prompt prints and what is on disk agree — and it
 * comes from core because hq names the same file on the wire when it seeds or
 * reads a person's agenda.
 */
export { AGENDA_FILE_NAME }

/**
 * Whether this person has an own area in this boundary at all. Every member of
 * a project does; a person's own storage holds only their own, so nobody else
 * has an agenda there.
 */
export function hasAgendaIn(loc: LocationRef, userId: string): boolean {
  return loc.ownerType === 'project' || loc.ownerId === userId
}

export function getAgendaFilePath(loc: LocationRef, userId: string): string {
  if (!hasAgendaIn(loc, userId)) {
    throw new Error(`A person has no area in another person's storage — ${userId} has no agenda in ${loc.ownerId}'s`)
  }
  return loc.ownerType === 'project'
    ? path.join(getMemberDir(loc.ownerId, userId), AGENDA_FILE_NAME)
    : path.join(getFilesDir('user', userId), AGENDA_FILE_NAME)
}

// Reading and writing the file from here is gone. Nothing called either: an
// agenda is written by the run itself, through the mount, and the only reader
// left is the prompt builder, which needs the path rather than the bytes. The
// reader also called a whitespace-only file "no agenda", which was the last
// place in either app where a blank file and a missing one meant the same
// thing — hq and the site now agree that only a missing file is missing.
