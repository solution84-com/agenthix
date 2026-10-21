/**
 * Reading a file's lines and telling what kind of file it is, as OpenCode's
 * `read` tool does (v1.18.32, `tool/read.ts`, `util/media.ts`), but from a
 * descriptor already opened and checked.
 */
import fs from 'node:fs'
import path from 'node:path'

export const MAX_LINE_LENGTH = 2000
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`
export const MAX_BYTES = 50 * 1024
export const MAX_BYTES_LABEL = `${MAX_BYTES / 1024} KB`
export const SAMPLE_BYTES = 4096
const CHUNK = 64 * 1024

/**
 * Line breaks as OpenCode's stream splitting reads them: `\n`, `\r\n` or a
 * lone `\r`; a last line needs no break, and a trailing break adds no line.
 */
export class LineSplitter {
  private partial = ''
  private pendingCR = false

  push(text: string): string[] {
    const lines: string[] = []
    let from = 0
    if (this.pendingCR) {
      this.pendingCR = false
      lines.push(this.partial)
      this.partial = ''
      if (text.startsWith('\n')) from = 1
    }
    for (let i = from; i < text.length; i++) {
      const c = text[i]
      if (c !== '\n' && c !== '\r') continue
      const line = this.partial + text.slice(from, i)
      this.partial = ''
      if (c === '\r') {
        if (i + 1 === text.length) {
          this.partial = line
          this.pendingCR = true
          return lines
        }
        if (text[i + 1] === '\n') i++
      }
      lines.push(line)
      from = i + 1
    }
    this.partial += text.slice(from)
    return lines
  }

  end(): string[] {
    const last = this.partial
    const had = this.partial.length > 0 || this.pendingCR
    this.partial = ''
    this.pendingCR = false
    return had ? [last] : []
  }
}

export type Lines = { raw: string[]; count: number; cut: boolean; more: boolean; offset: number }

/**
 * Up to `limit` lines from line `offset` (1-based), stopping at `maxBytes` of
 * output, each line counted with the `N: ` number it is shown with. Counts
 * every line of the file unless the byte cap stops it first.
 */
export function readLines(fd: number, opts: { limit: number; offset: number; maxBytes?: number }): Lines {
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  const start = opts.offset - 1
  const raw: string[] = []
  const flags = { bytes: 0, count: 0, cut: false, more: false, done: false }
  const decoder = new TextDecoder('utf-8')
  const splitter = new LineSplitter()

  const take = (text: string) => {
    if (flags.done) return
    flags.count += 1
    if (flags.count <= start) return
    if (raw.length >= opts.limit) {
      flags.more = true
      return
    }
    const line = text.length > MAX_LINE_LENGTH ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX : text
    const shown = `${flags.count}: ${line}`
    const size = Buffer.byteLength(shown, 'utf-8') + (raw.length > 0 ? 1 : 0)
    if (flags.bytes + size <= maxBytes) {
      raw.push(line)
      flags.bytes += size
      return
    }
    flags.cut = true
    flags.more = true
    flags.done = true
  }

  const buf = Buffer.alloc(CHUNK)
  let position = 0
  while (!flags.done) {
    const n = fs.readSync(fd, buf, 0, CHUNK, position)
    if (n === 0) break
    position += n
    for (const line of splitter.push(decoder.decode(buf.subarray(0, n), { stream: true }))) take(line)
  }
  if (!flags.done) {
    for (const line of splitter.push(decoder.decode())) take(line)
    for (const line of splitter.end()) take(line)
  }
  return { raw, count: flags.count, cut: flags.cut, more: flags.more, offset: opts.offset }
}

export function readSample(fd: number, size: number): Uint8Array {
  if (size === 0) return new Uint8Array()
  const buf = Buffer.alloc(Math.min(SAMPLE_BYTES, size))
  const n = fs.readSync(fd, buf, 0, buf.length, 0)
  return buf.subarray(0, n)
}

const BINARY_EXTENSIONS = new Set([
  '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.class', '.jar', '.war', '.7z', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.odt', '.ods', '.odp', '.bin', '.dat', '.obj', '.o', '.a', '.lib', '.wasm', '.pyc', '.pyo',
])

export function isBinaryFile(filepath: string, bytes: Uint8Array): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filepath).toLowerCase())) return true
  if (bytes.length === 0) return false
  let nonPrintable = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) nonPrintable++
  }
  return nonPrintable / bytes.length > 0.3
}

const EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
}

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((v, i) => bytes[i] === v)

export function sniffMime(bytes: Uint8Array, filepath: string): string {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp'
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return EXTENSION_MIME[path.extname(filepath).toLowerCase()] ?? 'application/octet-stream'
}

export const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
