/**
 * `credentialFile.ts` for tests that replace `node:fs/promises` with mocks:
 * the same operations done by plain path on whatever `fs` the test supplies,
 * so those tests keep asserting on `readFile`, `rename` and `rm`. The checks
 * the real module makes against links are tested on a real disk
 * (`credentialFile.links.test.ts`).
 *
 * Use: `vi.mock('../credentialFile', () => import('./fakeCredentialFile'))`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CredentialRead } from '../credentialFile'

export const CREDENTIALS_FILE = '.credentials.json'
export const CREDENTIAL_DOCUMENT_MAX_BYTES = 64 * 1024

export async function readCredentialFile(claudeHome: string): Promise<CredentialRead> {
  try {
    return { state: 'read', text: await fs.readFile(path.join(claudeHome, CREDENTIALS_FILE), 'utf-8') }
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? { state: 'missing' } : { state: 'refused' }
  }
}

export async function withCredentialFolder<T>(claudeHome: string, work: (dir: string) => Promise<T>): Promise<T> {
  return work(claudeHome)
}

export async function writeFileAtomicIn(dir: string, name: string, contents: string): Promise<void> {
  const tmpDest = path.join(dir, `.${name}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    await fs.writeFile(tmpDest, contents, { mode: 0o600, flag: 'wx' })
    await fs.rename(tmpDest, path.join(dir, name))
  } catch (err) {
    await fs.unlink(tmpDest).catch(() => {})
    throw err
  }
}

export async function writeFileAtomic(dest: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await writeFileAtomicIn(path.dirname(dest), path.basename(dest), contents)
}

export async function writeCredentialFile(claudeHome: string, contents: string): Promise<void> {
  await fs.mkdir(claudeHome, { recursive: true })
  await writeFileAtomicIn(claudeHome, CREDENTIALS_FILE, contents)
}

export async function removeCredentialDocument(claudeHome: string): Promise<void> {
  await fs.rm(path.join(claudeHome, CREDENTIALS_FILE), { force: true })
}
