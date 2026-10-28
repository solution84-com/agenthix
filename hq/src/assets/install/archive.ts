/**
 * A package as it arrives, read into its files (spec part 3 *The protocol* 1–2, security review H1): a ZIP, or a
 * folder sent file by file. Both hold one root folder, the package's, and every file under it is kept, `package.json`
 * included, so the fingerprint is taken over exactly what is stored. Anything a disk or a reader could take two ways
 * is refused, never skipped: two entries with one name, names that differ only by case or by how their letters are
 * encoded, hidden and system entries (`.DS_Store`, `__MACOSX`), unsafe paths, and a path that is both a file and a
 * folder. A ZIP is read with the Library reader's bounds (`library/packages/packageZip.ts`); a folder with the same.
 */
import { checkAssetFileList, PACKAGE_MAX_BYTES, type FileListProblem } from '@agenthix/core'
import { PackageZipError, readZipEntries, type PackageFile } from '../../library/packages/packageZip'

export const MAX_PACKAGE_ENTRIES = 2000

export type ArrivedPackage = {
  /** The root folder's name. */
  root: string
  /** Every file under the root, by path relative to it, in ordinal order. */
  files: PackageFile[]
}

export class PackageReadError extends Error {}

function problemText(p: FileListProblem): string {
  switch (p.problem) {
    case 'duplicate': return `it holds ${p.path} twice`
    case 'case': return `${p.path} and ${p.other} differ only by capital letters`
    case 'normalisation': return `${p.path} and ${p.other} differ only in how their letters are encoded`
    case 'metadata': return `${p.path} is a hidden or system file; package the folder without it`
    case 'invalid': return `${p.path} is not a safe path`
    case 'folder': return `${p.path} is both a file and a folder`
  }
}

/** Refuses the first problem with every name, folders' names included (their trailing `/` dropped). */
function checkNames(names: string[], folders: string[] = []): string {
  const problems = checkAssetFileList(names)
  for (const folder of folders) {
    const metadata = checkAssetFileList([`${folder}/x`]).find(p => p.problem === 'metadata' || p.problem === 'invalid')
    if (metadata) problems.push({ ...metadata, path: `${folder}/` })
  }
  if (problems.length) throw new PackageReadError(`This package can't be read: ${problemText(problems[0])}.`)
  const roots = new Set([...names, ...folders].map(n => n.split('/')[0]))
  const [root] = roots
  if (roots.size !== 1 || !root || !names.every(n => n.startsWith(`${root}/`))) {
    throw new PackageReadError("This package can't be read: everything in it must sit in one folder.")
  }
  return root
}

function sorted(files: PackageFile[]): PackageFile[] {
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export async function readZipPackage(buffer: Buffer): Promise<ArrivedPackage> {
  let root = ''
  try {
    const entries = await readZipEntries(buffer, names => {
      const folders = names.filter(n => n.endsWith('/')).map(n => n.slice(0, -1)).filter(n => n !== '')
      root = checkNames(names.filter(n => !n.endsWith('/')), folders)
    })
    return { root, files: sorted(entries.map(e => ({ path: e.name.slice(root.length + 1), content: e.content }))) }
  } catch (err) {
    if (err instanceof PackageZipError) throw new PackageReadError(err.message.replace(/^Invalid package: /, "This package can't be read: ") + '.')
    throw err
  }
}

/** A folder sent as files, each path starting with the folder's name. */
export function readFolderPackage(files: PackageFile[]): ArrivedPackage {
  if (files.length === 0) throw new PackageReadError('This folder is empty. Choose a folder with a SKILL.md in it.')
  if (files.length > MAX_PACKAGE_ENTRIES) throw new PackageReadError(`This package can't be read: it holds more than ${MAX_PACKAGE_ENTRIES} files.`)
  const total = files.reduce((sum, f) => sum + f.content.length, 0)
  if (total > PACKAGE_MAX_BYTES) throw new PackageReadError(`This package can't be read: its content is over the limit of ${PACKAGE_MAX_BYTES} bytes.`)
  const root = checkNames(files.map(f => f.path))
  return { root, files: sorted(files.map(f => ({ path: f.path.slice(root.length + 1), content: f.content }))) }
}
