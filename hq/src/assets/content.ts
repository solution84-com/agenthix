/**
 * Every asset version's, draft's and proposal's files, kept in `PackageContent` by digest (adr-0072): the same store,
 * digest and immutability as packages, without a `Package` row pointing at it. Whatever names a digest keeps it from
 * the sweep (`packages/packageContentSweep.ts`); whatever stops naming one releases it, so a run that already named it
 * keeps it for the grace period. An asset's fingerprint is its content's digest (core's `assetFingerprintInput`).
 */
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { assetFingerprintInput, PACKAGE_FORMAT_VERSION, PACKAGE_MAX_BYTES } from '@agenthix/core'
import type { Db } from '../packages/packageStore'
import type { PackageFile } from '../library/packages/packageZip'

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** The fingerprint of exactly these files; throws core's `AssetFileListError` for a list that can't be stored as listed. */
export function fingerprintOf(files: PackageFile[]): string {
  return sha256(assetFingerprintInput(files.map(f => ({ path: f.path, sha256: sha256(f.content) }))))
}

export class ContentTooLargeError extends Error {}

/** Stores the files under their fingerprint unless they are held already, and marks them held. Returns the digest. */
export async function storeContent(files: PackageFile[], db: Db): Promise<string> {
  const total = files.reduce((sum, f) => sum + f.content.length, 0)
  if (total > PACKAGE_MAX_BYTES) throw new ContentTooLargeError(`The content is ${total} bytes; the limit is ${PACKAGE_MAX_BYTES}.`)
  const digest = fingerprintOf(files)
  const held = await db.packageContent.findUnique({ where: { digest }, select: { digest: true } })
  if (held) {
    await db.packageContent.update({ where: { digest }, data: { releasedAt: null } })
    return digest
  }
  try {
    await db.packageContent.create({
      data: {
        digest,
        formatVersion: PACKAGE_FORMAT_VERSION,
        files: { create: files.map(f => ({ path: f.path, bytes: f.content, sha256: sha256(f.content) })) },
      },
    })
  } catch (err) {
    // The same content written by a concurrent writer is the same content.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
  }
  return digest
}

export async function readContent(digest: string, db: Db): Promise<PackageFile[]> {
  const files = await db.packageFile.findMany({ where: { contentDigest: digest }, select: { path: true, bytes: true }, orderBy: { path: 'asc' } })
  return files.map(f => ({ path: f.path, content: Buffer.from(f.bytes) }))
}

/** Starts the grace period for content a deleted row named. */
export async function releaseContent(digest: string, db: Db): Promise<void> {
  await db.packageContent.updateMany({ where: { digest }, data: { releasedAt: new Date() } })
}
