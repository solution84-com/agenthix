/**
 * A library package's ZIP, read and written (`packageManifest.ts` has the
 * layout). An uploaded archive is untrusted even though importing needs an
 * admin, so reading it holds to the same bounds as an agent archive
 * (`agents/agentZipService.ts`): a ceiling on entries; declared sizes checked
 * first as a fast refusal; then real inflated bytes counted as they stream,
 * stopping the moment the total passes the cap, since a declared size can lie;
 * no symlink entries; one root folder; and every path checked with
 * `isValidPackagePath` (no `..`, absolute or backslash segments). A Finder
 * zip's `__MACOSX/` and dotfile metadata is skipped, not treated as an escape.
 */
import JSZip from 'jszip'
import { isValidPackagePath, PACKAGE_MAX_BYTES } from '@agenthix/core'
import { PACKAGE_MANIFEST_FILE, PackageManifestError, parseManifest, type PackageManifest } from './packageManifest'

const MAX_ENTRIES = 2000

export type PackageFile = { path: string; content: Buffer }

export type ReadPackage = {
  /** The root folder's name. */
  root: string
  /** Null for an archive with no package.json (an agent archive from before packages). */
  manifest: PackageManifest | null
  /** Every file under the root but the manifest, by path relative to the root, in ordinal order. */
  files: PackageFile[]
}

export class PackageZipError extends Error {}

const isFinderMetadata = (name: string) => {
  const first = name.split('/')[0]
  return first.startsWith('__') || first.startsWith('.')
}

function assertDeclaredShape(zip: JSZip): void {
  const entries = Object.values(zip.files)
  if (entries.length > MAX_ENTRIES) throw new PackageZipError(`Invalid package: more than ${MAX_ENTRIES} entries`)
  let declared = 0
  for (const file of entries) {
    if (file.dir) continue
    const mode = (file as unknown as { unixPermissions?: number | null }).unixPermissions
    if (typeof mode === 'number' && (mode & 0xf000) === 0xa000) throw new PackageZipError(`Invalid package: ${file.name} is a symlink`)
    declared += (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
  }
  if (declared > PACKAGE_MAX_BYTES) throw new PackageZipError(`Invalid package: its content is over the limit of ${PACKAGE_MAX_BYTES} bytes`)
}

/** Reads one entry, counting real bytes against the archive-wide budget and stopping at the cap. */
function readCounted(file: JSZip.JSZipObject, budget: { used: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let settled = false
    // JSZip's internal stream (what .async() is built on) only flows once resumed,
    // so pausing it and never resuming abandons the inflate where it stands.
    type Stream = { on(event: string, cb: (...args: never[]) => void): Stream; resume(): Stream; pause(): Stream }
    const stream = (file as unknown as { internalStream(type: 'nodebuffer'): Stream }).internalStream('nodebuffer')
    stream.on('data', (chunk: Buffer) => {
      if (settled) return
      budget.used += chunk.length
      if (budget.used > PACKAGE_MAX_BYTES) {
        settled = true
        stream.pause()
        reject(new PackageZipError(`Invalid package: its content passed the limit of ${PACKAGE_MAX_BYTES} bytes`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', (err: Error) => {
      if (settled) return
      settled = true
      reject(new PackageZipError(`Invalid package: ${file.name} could not be read: ${err.message}`))
    })
    stream.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    stream.resume()
  })
}

export async function readPackageZip(buffer: Buffer): Promise<ReadPackage> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new PackageZipError('Invalid package: not a ZIP archive')
  }
  assertDeclaredShape(zip)
  const names = Object.keys(zip.files).filter(n => !isFinderMetadata(n))
  const roots = new Set(names.map(n => n.split('/')[0]))
  const [root] = roots
  if (roots.size !== 1 || !root || !names.every(n => n.startsWith(`${root}/`))) {
    throw new PackageZipError('Invalid package: everything in it must sit in one folder')
  }
  const budget = { used: 0 }
  const files: PackageFile[] = []
  let manifest: PackageManifest | null = null
  for (const name of names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const file = zip.files[name]
    if (file.dir) continue
    const relative = name.slice(root.length + 1)
    if (!isValidPackagePath(relative)) throw new PackageZipError(`Invalid package: unsafe path ${relative}`)
    const content = await readCounted(file, budget)
    if (relative !== PACKAGE_MANIFEST_FILE) {
      files.push({ path: relative, content })
      continue
    }
    try {
      manifest = parseManifest(JSON.parse(content.toString('utf-8')))
    } catch (err) {
      throw new PackageZipError(err instanceof PackageManifestError ? err.message : 'Invalid package: package.json is not valid JSON')
    }
  }
  return { root, manifest, files }
}

export async function writePackageZip(root: string, manifest: PackageManifest, files: PackageFile[]): Promise<Buffer> {
  const zip = new JSZip()
  const folder = zip.folder(root)!
  folder.file(PACKAGE_MANIFEST_FILE, JSON.stringify(manifest, null, 2))
  for (const file of files) if (file.path !== PACKAGE_MANIFEST_FILE) folder.file(file.path, file.content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

export function fileText(files: PackageFile[], path: string): string | null {
  return files.find(f => f.path === path)?.content.toString('utf-8') ?? null
}
