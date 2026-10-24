/**
 * Git's own files, read decompressed so a value a step committed is found (workflows spec part 2, *The changed-file
 * scan*). A loose object is one zlib stream; a pack holds many, some stored as deltas against another object of the
 * pack. Each object is given back whole, deltas applied, so the scan sees the bytes as committed.
 *
 * Files are recognised by their content, wherever they are: a step can put a repository anywhere. Nothing here runs
 * git, which would read the snapshot's own configuration. What can't be read whole fails closed: the caller treats it
 * as a leak.
 */
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

/** The most a pack's objects may come to, decompressed, before the scan gives up on it (and so fails closed). */
export const GIT_OBJECTS_MAX_BYTES = 1 << 30
const DELTA_DEPTH_MAX = 10_000

export class UnreadableGitObject extends Error {}

const LOOSE_HEADER = /^(blob|tree|commit|tag) (\d+)\0/

/** The object a loose object file holds, decompressed, or null when the bytes are not one. */
export function readLooseObject(file: Uint8Array): Buffer | null {
  if (file.length < 2 || (file[0]! & 0x0f) !== 8 || ((file[0]! << 8) | file[1]!) % 31 !== 0) return null
  let out: Buffer
  try {
    out = inflateSync(file, { maxOutputLength: GIT_OBJECTS_MAX_BYTES })
  } catch {
    return null
  }
  const header = LOOSE_HEADER.exec(out.subarray(0, 32).toString('latin1'))
  return header ? out : null
}

const PACK_MAGIC = Buffer.from('PACK')
const BUNDLE_MAGIC = /^# v[23] git bundle\n/

/** Where a pack starts in `file`: at 0 for a pack, after the header for a bundle; null when it holds none. */
export function packStart(file: Uint8Array): number | null {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  if (buf.subarray(0, 4).equals(PACK_MAGIC)) return 0
  if (!BUNDLE_MAGIC.test(buf.subarray(0, 20).toString('latin1'))) return null
  const end = buf.indexOf('\n\n')
  return end >= 0 && buf.subarray(end + 2, end + 6).equals(PACK_MAGIC) ? end + 2 : null
}

/** Whether a file that starts with `head` may be a loose object, a pack or a bundle, and so is read as git's. */
export function mayHoldGitObjects(head: Uint8Array): boolean {
  const text = Buffer.from(head.buffer, head.byteOffset, head.byteLength)
  if (text.subarray(0, 4).equals(PACK_MAGIC) || BUNDLE_MAGIC.test(text.toString('latin1'))) return true
  return head.length >= 2 && (head[0]! & 0x0f) === 8 && ((head[0]! << 8) | head[1]!) % 31 === 0
}

type Entry = {
  offset: number
  type: number
  baseOffset: number | null
  baseId: string | null
  data: Buffer
}

const TYPE_NAMES: Record<number, string> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' }

/**
 * Every object of the pack at `start` in `file`, decompressed with its deltas applied, in pack order. Throws
 * `UnreadableGitObject` when any object can't be read; nothing of it may then be taken as scanned.
 */
export function readPackObjects(file: Buffer, start: number): Buffer[] {
  let lastError: unknown
  for (const idBytes of [20, 32]) {
    try {
      return readPack(file, start, idBytes)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof UnreadableGitObject ? lastError : new UnreadableGitObject('The pack could not be read.')
}

function readPack(file: Buffer, start: number, idBytes: number): Buffer[] {
  const version = file.readUInt32BE(start + 4)
  if (version !== 2 && version !== 3) throw new UnreadableGitObject('The pack has a version the site cannot read.')
  const count = file.readUInt32BE(start + 8)
  const entries: Entry[] = []
  let at = start + 12
  let total = 0
  for (let i = 0; i < count; i++) {
    const offset = at
    let byte = file[at++]!
    const type = (byte >> 4) & 7
    let size = byte & 15
    let shift = 4
    while (byte & 0x80) {
      byte = file[at++]!
      size += (byte & 0x7f) * 2 ** shift
      shift += 7
    }
    let baseOffset: number | null = null
    let baseId: string | null = null
    if (type === 6) {
      byte = file[at++]!
      let rel = byte & 0x7f
      while (byte & 0x80) {
        byte = file[at++]!
        rel = (rel + 1) * 128 + (byte & 0x7f)
      }
      baseOffset = offset - rel
    } else if (type === 7) {
      baseId = file.subarray(at, at + idBytes).toString('hex')
      at += idBytes
    } else if (!TYPE_NAMES[type]) {
      throw new UnreadableGitObject('The pack holds an object of an unknown type.')
    }
    if (at >= file.length) throw new UnreadableGitObject('The pack ends early.')
    total += size
    if (total > GIT_OBJECTS_MAX_BYTES) throw new UnreadableGitObject('The pack is too large to scan.')
    const { data, consumed } = inflateObject(file.subarray(at), size)
    if (data.length !== size) throw new UnreadableGitObject('An object of the pack is not the size it says.')
    at += consumed
    entries.push({ offset, type, baseOffset, baseId, data })
  }
  return resolve(entries, idBytes === 20 ? 'sha1' : 'sha256')
}

function inflateObject(input: Buffer, size: number): { data: Buffer; consumed: number } {
  try {
    // `info` gives the engine too, whose `bytesWritten` is how much input the stream took; @types/node types only the buffer.
    const r = inflateSync(input, { info: true, maxOutputLength: Math.max(size, 1) }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }
    return { data: r.buffer, consumed: r.engine.bytesWritten }
  } catch {
    throw new UnreadableGitObject('An object of the pack could not be decompressed.')
  }
}

function resolve(entries: Entry[], idHash: 'sha1' | 'sha256'): Buffer[] {
  const byOffset = new Map(entries.map(e => [e.offset, e]))
  const resolved = new Map<number, { type: number; content: Buffer }>()
  const byId = new Map<string, number>()
  const record = (e: Entry, type: number, content: Buffer) => {
    resolved.set(e.offset, { type, content })
    const id = createHash(idHash).update(`${TYPE_NAMES[type]} ${content.length}\0`).update(content).digest('hex')
    byId.set(id, e.offset)
  }
  let pending = entries
  while (pending.length > 0) {
    const next: Entry[] = []
    for (const e of pending) {
      const chain: Entry[] = []
      let cur: Entry | undefined = e
      let base: { type: number; content: Buffer } | undefined
      while (cur && !(base = resolved.get(cur.offset))) {
        if (cur.baseOffset === null && cur.baseId === null) {
          record(cur, cur.type, cur.data)
          base = resolved.get(cur.offset)
          break
        }
        chain.push(cur)
        if (chain.length > DELTA_DEPTH_MAX) throw new UnreadableGitObject('A delta chain of the pack is too deep.')
        const baseAt: number | undefined = cur.baseOffset ?? byId.get(cur.baseId!)
        cur = baseAt === undefined ? undefined : byOffset.get(baseAt)
      }
      if (!base) { next.push(e); continue }
      for (let i = chain.length - 1; i >= 0; i--) {
        const content = applyDelta(base.content, chain[i]!.data)
        record(chain[i]!, base.type, content)
        base = { type: base.type, content }
      }
    }
    if (next.length === pending.length) throw new UnreadableGitObject('A delta of the pack has a base the pack does not hold.')
    pending = next
  }
  return entries.map(e => resolved.get(e.offset)!.content)
}

function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let at = 0
  const size = (): number => {
    let v = 0
    let shift = 0
    let byte: number
    do {
      byte = delta[at++]!
      v += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    return v
  }
  if (size() !== base.length) throw new UnreadableGitObject('A delta of the pack does not fit its base.')
  const out = Buffer.alloc(size())
  let written = 0
  while (at < delta.length) {
    const op = delta[at++]!
    if (op & 0x80) {
      let offset = 0
      let length = 0
      for (let i = 0; i < 4; i++) if (op & (1 << i)) offset += delta[at++]! * 2 ** (8 * i)
      for (let i = 0; i < 3; i++) if (op & (1 << (4 + i))) length += delta[at++]! * 2 ** (8 * i)
      if (length === 0) length = 0x10000
      if (offset + length > base.length || written + length > out.length) throw new UnreadableGitObject('A delta of the pack copies outside its base.')
      base.copy(out, written, offset, offset + length)
      written += length
    } else if (op > 0) {
      if (at + op > delta.length || written + op > out.length) throw new UnreadableGitObject('A delta of the pack ends early.')
      delta.copy(out, written, at, at + op)
      at += op
      written += op
    } else {
      throw new UnreadableGitObject('A delta of the pack has an instruction git does not write.')
    }
  }
  if (written !== out.length) throw new UnreadableGitObject('A delta of the pack is not the size it says.')
  return out
}
