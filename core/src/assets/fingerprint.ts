/**
 * The fingerprint and the signed statement (adr-0158, spec part 3 *The protocol* 2, security review H1).
 *
 * An asset's fingerprint is the sha256 of `packageDigestInput` over every file stored, `package.json` included, so
 * nothing the manifest says can be swapped on a signed package. It is written as a package digest is: 64 lowercase
 * hex characters, and for the same files it equals the digest the content is delivered under. What is signed is the
 * canonical JSON of `{ format, kind, publisher, name, version, fingerprint }`, nothing else.
 *
 * A file list is fingerprinted only once it passes `checkAssetFileList`: two entries that one disk would store as one
 * file (the same path, the same after case folding or NFC normalisation), an entry a reader would skip as metadata, or
 * a path that is also a folder would let the stored files differ from the fingerprinted ones. Core stays free of
 * crypto: each app hashes the input with its own.
 */
import {
  canonicalJson, isValidPackagePath, packageDigestInput, PACKAGE_DIGEST_PATTERN, PACKAGE_FORMAT_VERSION,
  type PackageFileEntry,
} from '../protocol/packages.js'
import { isAssetKind, isAssetName, type AssetKind } from './identity.js'
import { isSemVer } from './semver.js'

export type FileListProblem = {
  problem: 'duplicate' | 'case' | 'normalisation' | 'metadata' | 'invalid' | 'folder'
  path: string
  /** The earlier path it clashes with. */
  other?: string
}

export class AssetFileListError extends Error {
  constructor(readonly problems: FileListProblem[]) {
    super(`the file list cannot be fingerprinted: ${problems.map(p => `${p.problem} ${p.path}`).join(', ')}`)
  }
}

export function isAssetFingerprint(value: unknown): value is string {
  return typeof value === 'string' && PACKAGE_DIGEST_PATTERN.test(value)
}

/** A hidden entry (`.DS_Store`, `.git/…`) or a Finder archive's `__MACOSX` folder, at any depth. */
export function isMetadataPath(path: string): boolean {
  return path.split('/').some(s => (s.startsWith('.') && s !== '.' && s !== '..') || s === '__MACOSX')
}

const fold = (p: string) => p.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')

/** Every problem with a package's or a skill folder's file list, in the order found; empty when it may be fingerprinted. */
export function checkAssetFileList(paths: readonly string[]): FileListProblem[] {
  const problems: FileListProblem[] = []
  const exact = new Map<string, string>()
  const normalised = new Map<string, string>()
  const folded = new Map<string, string>()
  const folders = new Map<string, string>()
  for (const path of paths) {
    if (isMetadataPath(path)) { problems.push({ problem: 'metadata', path }); continue }
    const nfc = path.normalize('NFC')
    const key = fold(path)
    const clash = exact.get(path) ?? normalised.get(nfc) ?? folded.get(key)
    if (clash !== undefined) {
      problems.push({ problem: kindOfClash(path, clash), path, other: clash })
      continue
    }
    // A folder spelt two ways ("Docs/a.md", "docs/b.md") is one folder on a case-insensitive disk.
    const segments = path.split('/')
    const folderClash = segments.slice(0, -1).map((_, i) => {
      const folder = segments.slice(0, i + 1).join('/')
      const seen = folders.get(fold(folder))
      return seen !== undefined && seen !== folder ? seen : null
    }).find(seen => seen !== null)
    if (folderClash) {
      problems.push({ problem: kindOfClash(path, folderClash), path, other: folderClash })
      continue
    }
    exact.set(path, path)
    normalised.set(nfc, path)
    folded.set(key, path)
    if (!isValidPackagePath(path)) problems.push({ problem: 'invalid', path })
    for (let i = 1; i < segments.length; i++) {
      const folder = segments.slice(0, i).join('/')
      if (!folders.has(fold(folder))) folders.set(fold(folder), folder)
    }
  }
  for (const [key, path] of folded) {
    const folder = folders.get(key)
    if (folder !== undefined) {
      const inside = [...exact.keys()].find(p => fold(p).startsWith(`${key}/`)) ?? folder
      problems.push({ problem: 'folder', path, other: inside })
    }
  }
  return problems
}

/** How `path` clashes with `other`, which a disk would store as the same name. */
function kindOfClash(path: string, other: string): FileListProblem['problem'] {
  if (path === other) return 'duplicate'
  // A folder clash compares a path with an earlier folder, so the folder may be its start.
  const a = path.normalize('NFC')
  const b = other.normalize('NFC')
  return a === b || a.startsWith(`${b}/`) ? 'normalisation' : 'case'
}

/** The text an asset's fingerprint is the sha256 of. Throws `AssetFileListError` when the list fails the check. */
export function assetFingerprintInput(files: readonly PackageFileEntry[]): string {
  const problems = checkAssetFileList(files.map(f => f.path))
  if (problems.length) throw new AssetFileListError(problems)
  return packageDigestInput({ formatVersion: PACKAGE_FORMAT_VERSION, files: [...files] })
}

export type SignedStatement = {
  format: number
  kind: AssetKind
  /** The manifest's claim, which the signature binds; hq then checks it against the verified signer. */
  publisher: string
  name: string
  version: string
  fingerprint: string
}

/** The exact bytes a package's signature covers. Throws when a field is out of shape. */
export function signedStatement(s: SignedStatement): string {
  if (!Number.isSafeInteger(s.format) || s.format < 1) throw new Error('signed statement: "format" must be a positive integer')
  if (!isAssetKind(s.kind)) throw new Error('signed statement: "kind" is not an asset kind')
  if (!isAssetName(s.publisher)) throw new Error('signed statement: "publisher" is not a valid name')
  if (!isAssetName(s.name)) throw new Error('signed statement: "name" is not a valid name')
  if (!isSemVer(s.version)) throw new Error('signed statement: "version" is not SemVer')
  if (!isAssetFingerprint(s.fingerprint)) throw new Error('signed statement: "fingerprint" is not a fingerprint')
  const { format, kind, publisher, name, version, fingerprint } = s
  return canonicalJson({ format, kind, publisher, name, version, fingerprint })
}
