/**
 * A name a tool was given, resolved inside the folder it works on, and nowhere else. The name is hostile input: it
 * may not be absolute, climb with `..`, hold a NUL, or pass through a link anywhere inside the root. The root itself is
 * the caller's and trusted, so a link to it is followed once, here, and everything after is checked against its real
 * path.
 *
 * This is the check before the open. The open (verifiedFs.ts) checks again what it actually opened, so a link swapped
 * in between the two is still refused.
 */
import fs from 'node:fs'
import path from 'node:path'
import { refused, type FileToolRefusal } from './refusals.js'

const MAX_NAME_LENGTH = 4096

export type Resolved = { ok: true; path: string } | { ok: false; reason: FileToolRefusal; detail?: string }

const ABSOLUTE = /^(?:[/\\]|[A-Za-z]:)/

export function resolveInsideRoot(root: string, name: string): Resolved {
  if (typeof name !== 'string' || name.includes('\0') || name.length > MAX_NAME_LENGTH) return refused('invalid-name')
  if (ABSOLUTE.test(name)) return refused('outside-root')
  const segments = name.split('/').filter(s => s !== '' && s !== '.')
  if (segments.includes('..')) return refused('outside-root')

  let realRoot: string
  try {
    realRoot = fs.realpathSync(root)
    if (!fs.statSync(realRoot).isDirectory()) return refused('not-found', `root ${root} is not a folder`)
  } catch (err) {
    return refused('not-found', err)
  }

  let at = realRoot
  for (const segment of segments) {
    at = path.join(at, segment)
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(at)
    } catch {
      break
    }
    if (stat.isSymbolicLink()) return refused('link', `${at} is a link`)
    if (!stat.isDirectory()) break
  }
  return { ok: true, path: path.join(realRoot, ...segments) }
}
