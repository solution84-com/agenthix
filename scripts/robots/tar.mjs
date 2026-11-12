// A gzipped tar of plain files in one folder: all the robots bundle needs, written and read with Node alone, so the
// image build and a development machine need no tar program, and reading an archive can never write anywhere.
// Writing is reproducible: the same files in the same order give the same bytes (no times, owners or modes).
import zlib from 'node:zlib'

const BLOCK = 512
/** A flat file name: no folder, no leading dot, nothing a shell or a path would read specially. */
export const ENTRY_NAME = /^[a-z0-9][a-z0-9._-]*$/i
/** The most an archive may unpack to, so a hostile one cannot fill the disk or memory. */
export const MAX_UNPACKED_BYTES = 64 * 1024 * 1024

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0'
}

function header(name, size) {
  const h = Buffer.alloc(BLOCK)
  h.write(name, 0, 100, 'utf8')
  h.write(octal(0o644, 8), 100, 'ascii')
  h.write(octal(0, 8), 108, 'ascii')
  h.write(octal(0, 8), 116, 'ascii')
  h.write(octal(size, 12), 124, 'ascii')
  h.write(octal(0, 12), 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write('0', 156, 'ascii')
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  h.write(octal(checksum(h), 7) + ' ', 148, 'ascii')
  return h
}

function checksum(h) {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]
  return sum
}

const padding = (size) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK)

/** `entries`: [{ name, data }] in the order they are written. */
export function packTar(entries) {
  const parts = []
  const seen = new Set()
  for (const { name, data } of entries) {
    if (!ENTRY_NAME.test(name) || Buffer.byteLength(name) > 99) throw new Error(`Not a flat file name: ${JSON.stringify(name)}`)
    if (seen.has(name)) throw new Error(`${name} is in the archive twice`)
    seen.add(name)
    parts.push(header(name, data.length), data, padding(data.length))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 })
}

const field = (h, start, length) => {
  const raw = h.subarray(start, start + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? length : end).toString('utf8')
}

/** Reads an archive into a Map of name → bytes. Anything but a plain file with a flat name is refused. */
export function unpackTar(gzipped) {
  const tar = zlib.gunzipSync(gzipped, { maxOutputLength: MAX_UNPACKED_BYTES })
  const files = new Map()
  let at = 0
  while (at + BLOCK <= tar.length) {
    const h = tar.subarray(at, at + BLOCK)
    if (h.every((b) => b === 0)) return files
    const sum = Number.parseInt(field(h, 148, 8).trim(), 8)
    if (sum !== checksum(h)) throw new Error('The archive is damaged: a header checksum does not match')
    const name = field(h, 0, 100)
    const type = String.fromCharCode(h[156])
    if (type !== '0' && type !== '\0') throw new Error(`The archive holds something other than a plain file: ${JSON.stringify(name)}`)
    if (!ENTRY_NAME.test(name) || field(h, 345, 155) !== '') throw new Error(`The archive holds a name that is not flat: ${JSON.stringify(name)}`)
    if (files.has(name)) throw new Error(`The archive holds ${name} twice`)
    const size = Number.parseInt(field(h, 124, 12).trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0 || at + BLOCK + size > tar.length) throw new Error(`The archive is damaged at ${name}`)
    files.set(name, Buffer.from(tar.subarray(at + BLOCK, at + BLOCK + size)))
    at += BLOCK + size + ((BLOCK - (size % BLOCK)) % BLOCK)
  }
  throw new Error('The archive is damaged: it does not end')
}
