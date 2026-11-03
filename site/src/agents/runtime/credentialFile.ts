/**
 * The one way the site reads, writes and removes the credentials document in a
 * run's Claude folder (`<harness home>/.claude/`).
 *
 * The run writes that folder, and the harness home around it, so everything in
 * it is hostile: the document may be a link to another person's home, a device
 * or a huge file, and the run can rename `.claude` itself and put a link in its
 * place. The harness home is the folder the site made and bound at the image
 * user's home directory, which a run cannot replace, so every operation here
 * starts from it:
 *
 *  - a read goes through `readAgentWritableFile`: `.claude` a real folder with no
 *    link on the way, the document a regular file with one name, not a link,
 *    no larger than `CREDENTIAL_DOCUMENT_MAX_BYTES`;
 *  - a write or a removal opens `.claude` from the harness home, refusing a
 *    link, and acts through the open folder (`homeFolder.ts`): on Linux by its
 *    `/proc/self/fd` path, which no later rename can re-point; elsewhere by its
 *    real path, confirmed again afterwards.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { readAgentWritableFile } from './containedFile'
import { folderPath, harnessHomeOfClaudeFolder as harnessHomeOf, withHomeFolder } from './homeFolder'

export const CREDENTIALS_FILE = '.credentials.json'

/** A Claude Code credentials document is a few hundred bytes; hq refuses one past this too. */
export const CREDENTIAL_DOCUMENT_MAX_BYTES = 64 * 1024

/**
 * `missing`: no document. `refused`: something is there that is not a document
 * the site will read (a link, a device, a second name, too large, unreadable).
 */
export type CredentialRead = { state: 'missing' } | { state: 'refused' } | { state: 'read'; text: string }

export async function readCredentialFile(claudeHome: string): Promise<CredentialRead> {
  const result = await readAgentWritableFile(harnessHomeOf(claudeHome), path.join(claudeHome, CREDENTIALS_FILE), CREDENTIAL_DOCUMENT_MAX_BYTES)
  if (result.ok) return { state: 'read', text: result.buf.toString('utf-8') }
  return result.reason === 'missing' ? { state: 'missing' } : { state: 'refused' }
}

/**
 * Runs `work` with a path naming the Claude folder as it was opened and
 * checked (`homeFolder.ts`). Throws `Forbidden: …` when the folder is a link;
 * `ENOENT` when it is not there, unless `create`.
 */
export async function withCredentialFolder<T>(claudeHome: string, work: (dir: string) => Promise<T>, opts: { create?: boolean } = {}): Promise<T> {
  const label = 'the run\'s Claude folder is not a folder of its own'
  return withHomeFolder(harnessHomeOf(claudeHome), path.basename(path.resolve(claudeHome)), label, dir => work(folderPath(dir)), opts)
}

/**
 * Writes `contents` as the document without ever leaving it truncated or
 * half-written: a reader (Claude Code inside the container, or a concurrent
 * writer) that catches a plain write mid-flight sees a corrupt credentials
 * file. A temp file in the same folder, created fresh (`wx`, so nothing planted
 * under its name is followed), then renamed over the document, which replaces
 * a link there rather than writing through it. On failure the temp file is
 * removed before rethrowing.
 */
export async function writeCredentialFile(claudeHome: string, contents: string): Promise<void> {
  await withCredentialFolder(claudeHome, dir => writeFileAtomicIn(dir, CREDENTIALS_FILE, contents), { create: true })
}

/** The same atomic write into a folder only the site writes (the usage outbox). */
export async function writeFileAtomic(dest: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await writeFileAtomicIn(path.dirname(dest), path.basename(dest), contents)
}

/** Writes `name` in an already-checked folder (`withCredentialFolder`), atomically as above. */
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

/** Removes the document, or whatever the run put in its place. Absent, or no Claude folder at all, is success. */
export async function removeCredentialDocument(claudeHome: string): Promise<void> {
  try {
    await withCredentialFolder(claudeHome, dir => fs.rm(path.join(dir, CREDENTIALS_FILE), { force: true }))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
