/**
 * hq's package store (ADR-0072): each package points at its one current
 * content, and content is immutable, keyed by its digest. An edit writes new
 * content (or reuses identical content) and moves the pointer; there is no
 * version number. A run names the digests current when it starts and is served
 * exactly those, however the package is edited meanwhile — an edit applies from
 * the next run. Content no package points at is swept after a grace period
 * (packageContentSweep.ts).
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  PACKAGE_FORMAT_VERSION, PACKAGE_MAX_BYTES, MAX_SKILL_SLUG_LENGTH,
  isValidPackagePath, namespacedSkillName, packageDigestInput,
  type PackageContents, type PackageKind, type PackageRef, type PackageTransfer,
} from '@agenthix/core'

export type PackageFileInput = { path: string; content: Buffer }
export type PackageWrite = {
  kind: StoredPackageKind
  key: string
  files: PackageFileInput[]
  updatedById: string | null
}
export type WriteResult = { ref: PackageRef; changed: boolean }
export type CurrentPackage = { ref: PackageRef; updatedById: string | null }
export type LoadedPackage = {
  formatVersion: number
  files: Array<{ path: string; content: Buffer; sha256: string }>
}
export type Db = Prisma.TransactionClient

export class PackageContentError extends Error {
  constructor(message: string) { super(message); this.name = 'PackageContentError' }
}
/** hq no longer holds the content a run named — swept long after the package moved on. */
export class PackageNotFoundError extends Error {
  constructor(ref: PackageRef) {
    super(`hq no longer holds content ${ref.digest.slice(0, 12)} of the ${ref.kind} package ${ref.key} — start the run again`)
    this.name = 'PackageNotFoundError'
  }
}
export class PackageWriteConflictError extends Error {
  constructor(kind: StoredPackageKind, key: string) {
    super(`The ${kind} package ${key} was changed by someone else at the same moment — reload and try again`)
    this.name = 'PackageWriteConflictError'
  }
}

/** Skill content is held with its version row, not in the package store. */
export type StoredPackageKind = Exclude<PackageKind, 'skill'>

const PRISMA_KIND = { agent: 'AGENT', org: 'ORG', platform: 'PLATFORM' } as const

export function toPrismaKind(kind: StoredPackageKind): (typeof PRISMA_KIND)[StoredPackageKind] {
  return PRISMA_KIND[kind]
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function contentsFor(files: PackageFileInput[]): PackageContents {
  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    files: files.map(f => ({ path: f.path, sha256: sha256Hex(f.content) })),
  }
}

export function computePackageDigest(contents: PackageContents): string {
  return sha256Hex(packageDigestInput(contents))
}

/** A skill's slug must namespace to a valid skill name for every source, or no site can stage it (P20). */
export function assertSkillSlug(slug: string): void {
  if (namespacedSkillName('boundary', slug) === null) {
    throw new PackageContentError(
      `Skill slug "${slug}" must be lowercase letters, digits and hyphens, starting with a letter or digit, at most ${MAX_SKILL_SLUG_LENGTH} characters`,
    )
  }
}

/** Every check a site would otherwise fail on at store or staging time, refused here at write. */
function validateFiles(files: PackageFileInput[]): void {
  const seen = new Set<string>()
  let total = 0
  for (const f of files) {
    if (!isValidPackagePath(f.path)) throw new PackageContentError(`Invalid package file path ${JSON.stringify(f.path)}`)
    if (seen.has(f.path)) throw new PackageContentError(`Package file ${f.path} appears twice`)
    seen.add(f.path)
    total += f.content.length
    const segments = f.path.split('/')
    if (segments.length >= 3 && segments[0] === 'skills') assertSkillSlug(segments[1])
  }
  for (const f of files) {
    const segments = f.path.split('/')
    for (let i = 1; i < segments.length; i++) {
      const ancestor = segments.slice(0, i).join('/')
      if (seen.has(ancestor)) {
        throw new PackageContentError(`Package file ${ancestor} is also a directory holding ${f.path}`)
      }
    }
  }
  if (total > PACKAGE_MAX_BYTES) {
    throw new PackageContentError(`Package content is ${total} bytes; the limit is ${PACKAGE_MAX_BYTES}`)
  }
}

function kindKey(kind: StoredPackageKind, key: string) {
  return { kind_key: { kind: toPrismaKind(kind), key } }
}

export async function getCurrentPackage(kind: StoredPackageKind, key: string, db: Db = prisma): Promise<CurrentPackage | null> {
  const row = await db.package.findUnique({ where: kindKey(kind, key), select: { digest: true, updatedById: true } })
  if (!row) return null
  return { ref: { kind, key, digest: row.digest }, updatedById: row.updatedById }
}

/** Stores content under its digest unless it is already held. Content is never changed once written. */
async function ensureContent(digest: string, contents: PackageContents, files: PackageFileInput[], db: Db): Promise<void> {
  const held = await db.packageContent.findUnique({ where: { digest }, select: { digest: true } })
  if (held) {
    await db.packageContent.update({ where: { digest }, data: { releasedAt: null } })
    return
  }
  try {
    await db.packageContent.create({
      data: {
        digest,
        formatVersion: contents.formatVersion,
        files: { create: files.map((f, i) => ({ path: f.path, bytes: f.content, sha256: contents.files[i].sha256 })) },
      },
    })
  } catch (err) {
    // Identical content written by a concurrent writer is the same content.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
  }
}

async function release(digest: string, db: Db): Promise<void> {
  await db.packageContent.update({ where: { digest }, data: { releasedAt: new Date() } })
}

/**
 * Points a package at new content. Identical content changes nothing — not
 * even who last changed it. The content it pointed at before stays held, for
 * any run that started before the edit. A write that races another on the
 * same package is refused rather than silently overwriting it.
 */
export async function writePackage(input: PackageWrite, db: Db = prisma): Promise<WriteResult> {
  validateFiles(input.files)
  const contents = contentsFor(input.files)
  const digest = computePackageDigest(contents)
  const ref: PackageRef = { kind: input.kind, key: input.key, digest }

  const current = await getCurrentPackage(input.kind, input.key, db)
  if (current?.ref.digest === digest) return { ref, changed: false }

  await ensureContent(digest, contents, input.files, db)
  try {
    if (current) {
      // Guarded on the digest just read, so a concurrent writer that got there
      // first makes this update match nothing rather than overwrite theirs.
      const { count } = await db.package.updateMany({
        where: { kind: toPrismaKind(input.kind), key: input.key, digest: current.ref.digest },
        data: { digest, updatedById: input.updatedById },
      })
      if (count === 0) throw new PackageWriteConflictError(input.kind, input.key)
      await release(current.ref.digest, db)
    } else {
      await db.package.create({
        data: { kind: toPrismaKind(input.kind), key: input.key, digest, updatedById: input.updatedById },
      })
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new PackageWriteConflictError(input.kind, input.key)
    }
    throw err
  }
  return { ref, changed: true }
}

/**
 * Removes a package. The package table has no foreign key to its owner, so the
 * owner's own deletion asks, in the same transaction as the owner row. Its
 * content is released, not deleted — a run that already started may still need
 * it — and the sweep removes it later. A key with no package is not an error.
 */
export async function deletePackage(kind: StoredPackageKind, key: string, db: Db = prisma): Promise<void> {
  const current = await getCurrentPackage(kind, key, db)
  if (!current) return
  await db.package.deleteMany({ where: { kind: toPrismaKind(kind), key } })
  await release(current.ref.digest, db)
}

/** Exactly the content `ref` names, whether or not it is still the package's current content. */
export async function readPackage(ref: PackageRef, db: Db = prisma): Promise<LoadedPackage> {
  const row = await db.packageContent.findUnique({
    where: { digest: ref.digest },
    select: {
      formatVersion: true,
      files: { select: { path: true, bytes: true, sha256: true }, orderBy: { path: 'asc' } },
    },
  })
  if (!row) throw new PackageNotFoundError(ref)
  return {
    formatVersion: row.formatVersion,
    files: row.files.map(f => ({ path: f.path, content: Buffer.from(f.bytes), sha256: f.sha256 })),
  }
}

/** The current files of a package, or null when it has none yet. */
export async function readCurrentFiles(kind: StoredPackageKind, key: string, db: Db = prisma): Promise<PackageFileInput[] | null> {
  const row = await db.package.findUnique({
    where: kindKey(kind, key),
    select: { content: { select: { files: { select: { path: true, bytes: true }, orderBy: { path: 'asc' } } } } },
  })
  return row ? row.content.files.map(f => ({ path: f.path, content: Buffer.from(f.bytes) })) : null
}

export function toTransfer(ref: PackageRef, loaded: LoadedPackage): PackageTransfer {
  return {
    ref,
    contents: {
      formatVersion: loaded.formatVersion,
      files: loaded.files.map(f => ({ path: f.path, sha256: f.sha256 })),
    },
    data: Object.fromEntries(loaded.files.map(f => [f.path, f.content.toString('base64')])),
  }
}
