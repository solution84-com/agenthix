import fs from 'node:fs'
import path from 'node:path'

/** Moves a finished file into place and makes it survive a power cut: the file is flushed first, then the folder that now names it. */
export function renameDurably(from: string, to: string): void {
  const file = fs.openSync(from, 'r')
  try {
    fs.fsyncSync(file)
  } finally {
    fs.closeSync(file)
  }
  fs.renameSync(from, to)
  const dir = fs.openSync(path.dirname(to), 'r')
  try {
    fs.fsyncSync(dir)
  } finally {
    fs.closeSync(dir)
  }
}
