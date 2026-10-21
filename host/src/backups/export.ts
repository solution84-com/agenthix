/**
 * An export (spec §12, adr-0112): a backup sealed to a key made for that export alone, shown once, of which the
 * machine keeps nothing. Made on the machine, it is written to the state folder's `exports` (the machine admin's
 * alone), or to a folder the machine admin names there; made by the Fleet Console, it is held for the person to
 * download, and then leaves the machine (exportDownload.ts).
 */
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { folderProblem } from './io'
import { machineHolder, newPersonKey } from './keys'
import { rewrapBackup } from './seal'
import { BackupStore } from './store'
import { HELD_EXPORTS, markHeld } from './exportDownload'

export type ExportResult = {
  /** The file's name, which is also its id. */
  exportId: string
  /** Where it is, as the machine sees it. */
  file: string
  sizeBytes: number
  takenAt: string
  key: string
}

/** Where an export goes: a folder on the machine, the machine admin's `exports`, or held for the Fleet Console. */
export type ExportDestination = { to: string } | 'exports' | 'held'

/** Exports the backup on the machine named `name`. */
export async function exportBackup(ctx: Context, name: string, where: ExportDestination = 'exports'): Promise<ExportResult> {
  const to = typeof where === 'object' ? where.to : undefined
  if (to) {
    const problem = folderProblem(to)
    if (problem) throw new Refusal('malformed', `An export cannot be written to ${to}: ${problem}.`)
  }
  const store = new BackupStore(ctx.state)
  const found = (await store.list()).find(b => b.name === name)
  if (!found) throw new Refusal('not_found', 'There is no such backup on this machine.')
  const key = newPersonKey()
  const exportId = name.replace(/-(nightly|now|restore)-/, '-export-')
  const { bytes } = await rewrapBackup(store.bytes(name), machineHolder(ctx.state), key.publicKey)
  let file: string
  let sizeBytes = found.sizeBytes
  if (to) {
    await ctx.backupIO.folder.write(to, exportId, bytes)
    file = `${to.replace(/\/+$/, '')}/${exportId}`
  } else {
    const folder = where === 'held' ? HELD_EXPORTS : 'exports'
    const dir = ctx.state.folder(folder)
    const tmp = `${dir}/.${exportId}.part`
    try {
      await pipeline(Readable.from(bytes), fs.createWriteStream(tmp, { mode: 0o600 }))
      fs.renameSync(tmp, `${dir}/${exportId}`)
    } catch (err) {
      fs.rmSync(tmp, { force: true })
      throw err
    }
    if (where === 'held') markHeld(ctx, `${dir}/${exportId}`)
    sizeBytes = fs.statSync(`${dir}/${exportId}`).size
    const paths = await ctx.machinePaths()
    file = paths ? `${paths.state.replace(/\/+$/, '')}/${folder}/${exportId}` : `${dir}/${exportId}`
  }
  store.record({ lastExportAt: ctx.now().toISOString() })
  return { exportId, file, sizeBytes, takenAt: found.header.takenAt, key: key.words }
}
