/**
 * An export the Fleet Console made, held on the machine until it is downloaded (core's exportDownload.ts). Held in its
 * own folder of the state folder, apart from the machine admin's `exports`, which a controller never reaches. The
 * Fleet Console reads it a chunk at a time — each its answer to a command, signed by this machine and sealed to it —
 * and once the person has it, says so, and this machine removes its copy: an export is one person's file, not a
 * backup the machine keeps. One nobody downloaded is removed `EXPORT_HELD_MS` after it was made.
 */
import fs from 'node:fs'
import { EXPORT_CHUNK_BYTES, EXPORT_HELD_MS, isExportId, type ExportChunk } from '@agenthix/core'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'

/** The state folder's sub-folder that holds them. */
export const HELD_EXPORTS = 'exports-held'

const heldDir = (ctx: Context) => ctx.state.folder(HELD_EXPORTS)

function heldFile(ctx: Context, exportId: string): string {
  // core's parser let only an export's file name through; checked again, as it names a file.
  if (!isExportId(exportId)) throw new Refusal('malformed', 'That is not an export.')
  return `${heldDir(ctx)}/${exportId}`
}

/** Marks a held export as made now, by the service's clock, which the sweep reads. */
export function markHeld(ctx: Context, file: string): void {
  const now = ctx.now()
  fs.utimesSync(file, now, now)
}

export function readHeldExport(ctx: Context, exportId: string, offset: number): ExportChunk {
  const file = heldFile(ctx, exportId)
  let fd: number
  try {
    fd = fs.openSync(file, 'r')
  } catch {
    throw new Refusal('not_found', `This export is no longer on ${ctx.machine.name}: an export is removed once it is downloaded, or a day after it was made. Make another export.`)
  }
  try {
    const sizeBytes = fs.fstatSync(fd).size
    if (offset >= sizeBytes) throw new Refusal('malformed', 'That is past the end of the export.')
    const buffer = Buffer.alloc(Math.min(EXPORT_CHUNK_BYTES, sizeBytes - offset))
    let read = 0
    while (read < buffer.length) {
      const n = fs.readSync(fd, buffer, read, buffer.length - read, offset + read)
      if (n === 0) throw new Refusal('failed', 'The export ended sooner than its size on the machine.')
      read += n
    }
    return { exportId, offset, sizeBytes, last: offset + read === sizeBytes, data: buffer.toString('base64url') }
  } finally {
    fs.closeSync(fd)
  }
}

/** The person has the export: the machine's copy goes. `removed` is false when there was none. */
export function releaseHeldExport(ctx: Context, exportId: string): { removed: boolean } {
  const file = heldFile(ctx, exportId)
  if (!fs.existsSync(file)) return { removed: false }
  fs.rmSync(file, { force: true })
  return { removed: true }
}

/** Removes every held export made more than `EXPORT_HELD_MS` ago, and anything half-written as long ago. */
export function sweepHeldExports(ctx: Context): void {
  const dir = heldDir(ctx)
  const now = ctx.now().getTime()
  for (const name of fs.readdirSync(dir)) {
    const file = `${dir}/${name}`
    try {
      if (now - fs.statSync(file).mtimeMs > EXPORT_HELD_MS) fs.rmSync(file, { force: true, recursive: true })
    } catch {
      // Gone meanwhile, or unreadable: the next sweep tries again.
    }
  }
}

export function startHeldExportSweep(ctx: Context, everyMs = 15 * 60_000): () => void {
  const sweep = () => {
    try {
      sweepHeldExports(ctx)
    } catch (err) {
      console.warn(`Held exports could not be swept: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  sweep()
  const timer = setInterval(sweep, everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
