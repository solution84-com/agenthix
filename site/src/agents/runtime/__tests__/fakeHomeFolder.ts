/**
 * `homeFolder.ts` for tests that replace `node:fs/promises` with mocks: the same operations done by plain path on
 * whatever `fs` the test supplies, so those tests keep asserting on `mkdtemp`, `writeFile` and `rm`. The checks the
 * real module makes against links are tested on a real disk (`homeFolder.links.test.ts`).
 *
 * Use: `vi.mock('../homeFolder', () => import('./fakeHomeFolder'))`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Dir } from '../homeFolder'

const at = (real: string) => ({ real, rel: '' }) as unknown as Dir

export const closeDir = async (): Promise<void> => {}
export const inDir = (dir: Dir, name: string): string => path.join(dir.real, name)
export const lstatIn = async (dir: Dir, name: string) => fs.lstat(path.join(dir.real, name)).catch(() => null)
export const namesIn = async (dir: Dir): Promise<string[]> => (await fs.readdir(dir.real)).map(String).sort()
export const folderPath = (dir: Dir): string => dir.real
export const openTreeRoot = async (root: string): Promise<Dir> => at(root)
export const harnessHomeOfClaudeFolder = (claudeHome: string): string => path.dirname(path.resolve(claudeHome))

export async function withHomeFolder<T>(home: string, relPath: string, _label: string, work: (dir: Dir) => Promise<T>, opts: { create?: boolean } = {}): Promise<T> {
  const dir = path.join(home, relPath)
  if (opts.create) await fs.mkdir(dir, { recursive: true })
  return work(at(dir))
}

export async function withRunStaging<T>(runStaging: string, folder: string, work: (dir: Dir) => Promise<T>, opts: { create?: boolean } = {}): Promise<T> {
  const dir = path.join(runStaging, folder)
  if (opts.create) await fs.mkdir(dir, { recursive: true })
  return work(at(dir))
}

export async function openFolderIn(dir: Dir, relPath: string): Promise<Dir> {
  const full = path.join(dir.real, relPath)
  await fs.mkdir(full, { recursive: true })
  return at(full)
}

export async function writeFileAtomicInDir(dir: Dir, name: string, contents: string | Buffer): Promise<void> {
  await fs.writeFile(path.join(dir.real, name), contents)
}

export async function writeNewFileUnder(dir: Dir, relFile: string, contents: string | Buffer): Promise<void> {
  const full = path.join(dir.real, relFile)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, contents)
}

export async function readFileUnder(dir: Dir, relFile: string): Promise<Buffer> {
  return Buffer.from(await fs.readFile(path.join(dir.real, relFile)))
}

export async function removeEntryIn(dir: Dir, name: string): Promise<void> {
  await fs.rm(path.join(dir.real, name), { recursive: true, force: true })
}

export async function removeFromRunStaging(entryPath: string): Promise<void> {
  await fs.rm(entryPath, { recursive: true, force: true })
}

export async function ensureRealFolders(home: string, relative: string): Promise<void> {
  await fs.mkdir(path.join(home, relative), { recursive: true })
}

export async function ensureFoldersUnder(root: string, relatives: readonly string[]): Promise<void> {
  for (const rel of relatives) await fs.mkdir(path.join(root, rel), { recursive: true })
}
