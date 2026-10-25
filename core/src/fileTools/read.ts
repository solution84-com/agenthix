/**
 * Reading a text file inside a root as Claude Code's Read gives it: lines numbered `cat -n` style, from `offset` for
 * `limit` lines (2,000 by default), each line cut at 2,000 characters; and the file's version, a hash of its bytes,
 * which a later write carries to be refused if the file changed in between.
 */
import { createHash } from 'node:crypto'
import { resolveInsideRoot } from './paths.js'
import { refusalFor, refused, type Refused } from './refusals.js'
import { systemFdPaths } from './systemFdPaths.js'
import { isBinaryFile, LineSplitter, MAX_LINE_LENGTH, SAMPLE_BYTES } from './textFile.js'
import { closeQuietly, openForRead, readAll, type FdPaths } from './verifiedFs.js'

export const DEFAULT_READ_LINES = 2000
/** The largest file read or written, in bytes. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
const LINE_CUT = ` [line cut at 2,000 characters]`

export type ReadArgs = { file: string; offset?: number; limit?: number }

export type ReadResult =
  | { ok: true; content: string; version: string; startLine: number; endLine: number; totalLines: number; more: boolean }
  | Refused

export function versionOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function splitLines(text: string): string[] {
  const splitter = new LineSplitter()
  return [...splitter.push(text), ...splitter.end()]
}

const wholeFrom = (n: unknown, min: number) => n === undefined || (Number.isInteger(n) && (n as number) >= min)

/** The bytes of the regular text file at `p`, or why not. */
export function readTextFile(sys: FdPaths, p: string): { ok: true; bytes: Uint8Array } | Refused {
  let fd: number
  try {
    const opened = openForRead(sys, p)
    fd = opened.fd
    if (!opened.stat.isFile()) {
      closeQuietly(fd)
      return refused('not-a-file')
    }
    if (opened.stat.size > MAX_FILE_BYTES) {
      closeQuietly(fd)
      return refused('too-large')
    }
  } catch (err) {
    return refusalFor(err)
  }
  try {
    const bytes = readAll(fd)
    if (bytes.length > MAX_FILE_BYTES) return refused('too-large')
    if (isBinaryFile(p, bytes.subarray(0, SAMPLE_BYTES))) return refused('binary')
    return { ok: true, bytes }
  } catch (err) {
    return refusalFor(err)
  } finally {
    closeQuietly(fd)
  }
}

export function read(root: string, args: ReadArgs, sys: FdPaths = systemFdPaths()): ReadResult {
  if (!wholeFrom(args.offset, 0) || !wholeFrom(args.limit, 1)) return refused('invalid-argument')
  const resolved = resolveInsideRoot(root, args.file)
  if (!resolved.ok) return resolved
  const file = readTextFile(sys, resolved.path)
  if (!file.ok) return file

  const lines = splitLines(new TextDecoder('utf-8').decode(file.bytes))
  const start = Math.max(args.offset ?? 1, 1) - 1
  const shown = lines.slice(start, start + (args.limit ?? DEFAULT_READ_LINES))
  const content = shown
    .map((line, i) => {
      const cut = line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + LINE_CUT : line
      return `${String(start + i + 1).padStart(6)}\t${cut}`
    })
    .join('\n')
  return {
    ok: true,
    content,
    version: versionOf(file.bytes),
    startLine: start + 1,
    endLine: start + shown.length,
    totalLines: lines.length,
    more: start + shown.length < lines.length,
  }
}
