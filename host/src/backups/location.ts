/**
 * The backup location (spec §12, adr-0112): a folder the machine can write to, set only on the machine itself —
 * these operations are the owner socket's alone and never a controller's. Setting it is two steps, so nothing is
 * promised before the folder passes a test write and the person says they have stored the key: `prepare` tests
 * the folder and makes the key, `confirm` sets it. The machine keeps only the key's public half.
 */
import crypto from 'node:crypto'
import type { Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { folderProblem } from './io'
import { keyWords, newPersonKey, parseKeyWords } from './keys'
import { BackupStore } from './store'

const PENDING_MS = 15 * 60_000
const pending = new Map<string, { path: string; publicKey: string; until: number }>()

export type LocationPrepared = { pendingId: string; path: string; key: string }

export async function prepareLocation(ctx: Context, path: string, progress: (p: Progress) => void): Promise<LocationPrepared> {
  if (new BackupStore(ctx.state).location()?.setBy === 'cloud') {
    throw new Refusal('conflict', `The backup location of ${ctx.machine.name} is set by Agenthix Cloud, and changes only through it. Nothing changed.`)
  }
  const problem = folderProblem(path)
  if (problem) throw new Refusal('malformed', `The backup location cannot be ${path}: ${problem}. Nothing changed.`)
  progress({ event: 'step', step: 'Testing that this machine can write there' })
  const failed = await ctx.backupIO.folder.testWrite(path)
  progress({ event: 'stepDone', outcome: failed ? 'fails' : 'passes' })
  if (failed) {
    const why = failed === 'missing' ? `${path} does not exist on ${ctx.machine.name}.` : `${ctx.machine.name} cannot write there: ${failed}`
    throw new Refusal('failed', `${why} Not set. Nothing changed. Check the folder is mounted, then run this again.`)
  }
  const now = ctx.now().getTime()
  for (const [id, p] of pending) if (p.until < now) pending.delete(id)
  const key = newPersonKey()
  const pendingId = crypto.randomBytes(12).toString('base64url')
  pending.set(pendingId, { path, publicKey: key.publicKey.toString('base64url'), until: now + PENDING_MS })
  return { pendingId, path, key: key.words }
}

export function confirmLocation(ctx: Context, pendingId: string): { path: string } {
  const p = pending.get(pendingId)
  pending.delete(pendingId)
  if (!p || p.until < ctx.now().getTime()) {
    throw new Refusal('not_found', 'That choice of folder has expired, and nothing was set. Run the command again.')
  }
  new BackupStore(ctx.state).setLocation({ path: p.path, publicKey: p.publicKey, setAt: ctx.now().toISOString() })
  return { path: p.path }
}

/**
 * Saves a key a person was just shown as a small file in the state folder, readable by the machine admin only,
 * so they can copy it somewhere apart from the backups. Returns where it is, as the machine sees it.
 */
export async function saveKeyFile(ctx: Context, words: string, label: 'location' | 'export'): Promise<{ file: string }> {
  const bytes = parseKeyWords(words)
  if (!bytes) throw new Refusal('malformed', 'That is not a key this host service made.')
  const stamp = ctx.now().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const name = `${label === 'location' ? 'backup-location' : 'export'}-key-${stamp}.txt`
  ctx.state.writePrivate(['keys', name], `${keyWords(bytes)}\n`)
  const paths = await ctx.machinePaths()
  return { file: paths ? `${paths.state.replace(/\/+$/, '')}/keys/${name}` : ctx.state.path('keys', name) }
}
