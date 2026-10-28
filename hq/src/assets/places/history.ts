/**
 * Reading a place skill (spec part 4 FV3, FV4; security review L3): its version history from hq's record, and every
 * file it holds now with what changed since its newest version, for *changed in files, not published* and for
 * switching it on. The files are read from the site, and the fingerprint returned is of exactly those files: the one
 * a switch, a publish from files or a put back names. Anyone who sees the place reads them.
 */
import type { PrismaClient } from '@prisma/client'
import { fingerprintOf, readContent } from '../content'
import { fileChanges, type FileChanges } from '../lifecycle/versions'
import { LifecycleError } from '../lifecycle/errors'
import { assertSees, placeOfSkill } from './place'
import { liveFiles, newestVersion } from './placeDrafts'

const NOTHING = 'Nothing was changed.'

export type PlaceVersionView = { id: string; number: number; note: string | null; publishedById: string | null; requestedByAgentId: string | null; at: Date; inFiles: boolean }

export async function placeSkillVersions(db: PrismaClient, userId: string, placeSkillId: unknown): Promise<{ path: string; versions: PlaceVersionView[] }> {
  const { ctx, skill } = await placeOfSkill(db, placeSkillId)
  await assertSees(userId, ctx)
  const versions = await db.placeSkillVersion.findMany({ where: { placeSkillId: skill.id }, orderBy: { number: 'desc' } })
  return {
    path: skill.path,
    versions: versions.map(v => ({
      id: v.id, number: v.number, note: v.note, publishedById: v.publishedById, requestedByAgentId: v.requestedByAgentId,
      at: v.createdAt, inFiles: !skill.goneAt && v.digest === skill.lastFingerprint,
    })),
  }
}

export type PlaceSkillFilesView = {
  fingerprint: string
  /** Whether that is what the place was last seen holding; when not, look at the place again before acting. */
  current: boolean
  files: { path: string; base64: string }[]
  newestVersion: number | null
  changes: FileChanges
}

export async function placeSkillFiles(db: PrismaClient, userId: string, placeSkillId: unknown): Promise<PlaceSkillFilesView> {
  const { ctx, skill } = await placeOfSkill(db, placeSkillId)
  await assertSees(userId, ctx)
  if (skill.goneAt) throw new LifecycleError(`That skill's folder is no longer in the place's files. ${NOTHING}`, 409)
  const files = await liveFiles(db, ctx, skill)
  const newest = await newestVersion(db, skill.id)
  const fingerprint = fingerprintOf(files)
  return {
    fingerprint,
    current: fingerprint === skill.lastFingerprint,
    files: files.map(f => ({ path: f.path, base64: f.content.toString('base64') })),
    newestVersion: newest?.number ?? null,
    changes: fileChanges(newest ? await readContent(newest.digest, db) : [], files),
  }
}
