/**
 * An upload (spec part 3 *Sources*): a package ZIP, or a skill folder sent file by file, with its signature file
 * (`package.sigstore.json`) when it has one. Sizes are bounded before anything is decoded; the package itself is
 * read with the archive bounds (`install/archive.ts`).
 */
import { PACKAGE_MAX_BYTES } from '@agenthix/core'
import { MAX_PACKAGE_ENTRIES, PackageReadError, readFolderPackage, readZipPackage } from '../install/archive'
import type { Arrival } from '../install/types'

export type UploadArgs = {
  /** A ZIP, base64. */
  zip?: string
  /** A folder's files, each path starting with the folder's name, contents base64. */
  folder?: Array<{ path: string; base64: string }>
  /** `package.sigstore.json`, base64. */
  signature?: string | null
}

/** A sigstore bundle is a few kilobytes; anything near this is not one. */
export const MAX_SIGNATURE_BYTES = 256 * 1024
/** A ZIP of content at the cap can be a little larger than its content. */
const MAX_ARCHIVE_BYTES = PACKAGE_MAX_BYTES + 1024 * 1024

const decodedSize = (base64: string) => Math.floor((base64.length * 3) / 4)

function decode(value: unknown, limit: number, what: string): Buffer {
  if (typeof value !== 'string' || value === '') throw new PackageReadError(`Choose ${what} to upload.`)
  if (decodedSize(value) > limit) throw new PackageReadError(`This ${what} is over the limit of ${limit} bytes.`)
  return Buffer.from(value, 'base64')
}

export async function uploadArrival(args: UploadArgs): Promise<Arrival> {
  const bundle = args.signature ? decode(args.signature, MAX_SIGNATURE_BYTES, 'signature file') : null
  if (args.zip !== undefined && args.folder !== undefined) throw new PackageReadError('Upload a ZIP or a folder, not both.')
  if (args.zip !== undefined) {
    return { source: 'upload', arrived: await readZipPackage(decode(args.zip, MAX_ARCHIVE_BYTES, 'package')), bundle, sourceUrl: null }
  }
  const folder = args.folder
  if (!Array.isArray(folder) || folder.length === 0) throw new PackageReadError('Choose a package or a skill folder to upload.')
  if (folder.length > MAX_PACKAGE_ENTRIES) throw new PackageReadError(`This folder holds more than ${MAX_PACKAGE_ENTRIES} files.`)
  const total = folder.reduce((sum, f) => sum + (typeof f?.base64 === 'string' ? decodedSize(f.base64) : 0), 0)
  if (total > PACKAGE_MAX_BYTES) throw new PackageReadError(`This folder is over the limit of ${PACKAGE_MAX_BYTES} bytes.`)
  const files = folder.map(f => {
    if (typeof f?.path !== 'string' || typeof f.base64 !== 'string') throw new PackageReadError('Each file in the folder needs its path and content.')
    return { path: f.path, content: Buffer.from(f.base64, 'base64') }
  })
  return { source: 'upload', arrived: readFolderPackage(files), bundle, sourceUrl: null }
}
