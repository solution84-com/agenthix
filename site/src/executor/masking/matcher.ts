/**
 * Finds the masked forms of a run's material in a stretch of bytes (workflows spec part 2, *Masking*): the window of
 * each form's length at every position, hashed under the run's key and looked up by its digest.
 *
 * A window is hashed only where it could be a form. Each form carries its class (core's `protocol/workflowRuns.ts`):
 * a base64, hex or URL-encoded form holds only its encoding's bytes, so a window holding any other byte can't be one
 * and is skipped. Each class keeps a cursor on where its run of bytes ends, so finding that costs one look per byte.
 *
 * A window that holds a newline is looked at only for forms of at most `CROSS_LINE_MAX` bytes. Of the forms hq makes,
 * only a value's own bytes can hold a newline, and a value of several lines also has each line as a form, so a long
 * key file printed whole is still masked, line by line. Without this rule a 48 KB file would be hashed whole at every
 * position of the output; with it, a form longer than a line costs nothing on ordinary, line-by-line output.
 */
import { WORKFLOW_MASK_FORM_CLASS_BYTES, WORKFLOW_MASK_FORM_CLASSES, type WorkflowMaskFormClass, type WorkflowMaskingMaterial } from '@agenthix/core'
import { WindowHasher } from './hmacWindows'

export const CROSS_LINE_MAX = 256
const NEWLINE = 0x0a
const RAW = 0

type Form = { length: number; digest: Int32Array; secretName: string }

export type Match = { length: number; secretNames: string[] }

/** The classes other than raw, by index; class 0 is raw. */
const CLASSES = WORKFLOW_MASK_FORM_CLASSES.filter((c): c is Exclude<WorkflowMaskFormClass, 'raw'> => c !== 'raw')
/** For each byte, a bit for each class (by index in `CLASSES`) that holds it. */
const CLASS_BITS = (() => {
  const bits = new Uint8Array(256)
  CLASSES.forEach((c, i) => { for (const ch of WORKFLOW_MASK_FORM_CLASS_BYTES[c]) bits[ch.charCodeAt(0)]! |= 1 << i })
  return bits
})()

export class FormMatcher {
  readonly hasher: WindowHasher
  readonly byFirstWord = new Map<number, Form[]>()
  /** Distinct form lengths of each class, ascending: index 0 raw, then `CLASSES` + 1. */
  readonly lengthsByClass: number[][]
  /** Every distinct length, ascending, and for each a bit per class that has a form of it (bit 0 raw). */
  readonly lengths: number[]
  readonly classMasks: number[]
  readonly maxLength: number

  constructor(material: WorkflowMaskingMaterial) {
    this.hasher = new WindowHasher(Buffer.from(material.key, 'base64'))
    const byClass = WORKFLOW_MASK_FORM_CLASSES.map(() => new Set<number>())
    for (const f of material.forms) {
      const cls = WORKFLOW_MASK_FORM_CLASSES.indexOf(f.class ?? 'raw')
      if (!Number.isInteger(f.length) || f.length < 1 || !/^[0-9a-f]{64}$/i.test(f.hmac) || cls < 0) {
        throw new Error('The masking material has a form that is not a length, an HMAC-SHA-256 and a class.')
      }
      const digest = new Int32Array(8)
      for (let i = 0; i < 8; i++) digest[i] = Number.parseInt(f.hmac.slice(8 * i, 8 * i + 8), 16) | 0
      const list = this.byFirstWord.get(digest[0]!) ?? []
      list.push({ length: f.length, digest, secretName: f.secretName })
      this.byFirstWord.set(digest[0]!, list)
      byClass[cls]!.add(f.length)
    }
    this.lengthsByClass = byClass.map(s => [...s].sort((a, b) => a - b))
    const masks = new Map<number, number>()
    this.lengthsByClass.forEach((ls, c) => { for (const l of ls) masks.set(l, (masks.get(l) ?? 0) | (1 << c)) })
    this.lengths = [...masks.keys()].sort((a, b) => a - b)
    this.classMasks = this.lengths.map(l => masks.get(l)!)
    this.maxLength = this.lengths.at(-1) ?? 0
  }

  get empty(): boolean {
    return this.lengths.length === 0
  }

  /** A pass over one buffer, front to back. */
  over(buf: Uint8Array): BufferMatch {
    return new BufferMatch(this, buf)
  }
}

/** Finds forms at positions moving forward through one buffer. */
export class BufferMatch {
  private newlineAt = -1
  /** For each class but raw, where its run of bytes that starts at or before the position ends. */
  private readonly runEnd: Int32Array
  private readonly eligible: number[] = []
  /** For the position being matched, how far each class's run reaches (index as `FormMatcher.lengthsByClass`). */
  private readonly rooms = new Int32Array(WORKFLOW_MASK_FORM_CLASSES.length)
  private readonly rawCross: number
  private readonly rawLong: number
  private readonly classMax: number[]

  constructor(private readonly m: FormMatcher, private readonly buf: Uint8Array) {
    this.runEnd = new Int32Array(CLASSES.length).fill(-1)
    const raw = m.lengthsByClass[RAW]!
    this.rawCross = raw.filter(l => l <= CROSS_LINE_MAX).at(-1) ?? 0
    this.rawLong = raw.at(-1) ?? 0
    this.classMax = CLASSES.map((_, i) => m.lengthsByClass[i + 1]!.at(-1) ?? 0)
  }

  private newline(p: number): number {
    if (this.newlineAt < p) {
      const i = this.buf.indexOf(NEWLINE, p)
      this.newlineAt = i === -1 ? this.buf.length : i
    }
    return this.newlineAt
  }

  /** The end of the run of class `i`'s bytes from `p`: `p` itself when the byte at `p` is not one. */
  private run(i: number, p: number): number {
    let end = this.runEnd[i]!
    if (end < p) {
      const bit = 1 << i
      const { buf } = this
      end = p
      while (end < buf.length && (CLASS_BITS[buf[end]!]! & bit)) end++
      this.runEnd[i] = end
    }
    return end
  }

  /**
   * Whether every window starting at `p` that could hold a form is already in the buffer: for raw forms, those up to
   * `CROSS_LINE_MAX` and the longer ones unless a newline cuts them short; for each other class, its longest unless
   * its run of bytes has already ended.
   */
  decidable(p: number): boolean {
    const len = this.buf.length
    if (p + this.rawCross > len) return false
    if (this.rawLong > CROSS_LINE_MAX && p + this.rawLong > len && this.newline(p) >= len) return false
    for (let i = 0; i < CLASSES.length; i++) {
      const max = this.classMax[i]!
      if (max && p + max > len && this.run(i, p) >= len) return false
    }
    return true
  }

  /** The longest form found at `p`, looking only at windows that end within the buffer. */
  matchAt(p: number): Match | null {
    const { m, buf, eligible, rooms } = this
    const room = buf.length - p
    let lineRoom = -1
    let classes = 0
    for (let i = 0; i < CLASSES.length; i++) {
      if (!this.classMax[i]) continue
      const r = this.run(i, p) - p
      rooms[i + 1] = r
      if (r > 0) classes |= 1 << (i + 1)
    }
    eligible.length = 0
    for (let n = 0; n < m.lengths.length; n++) {
      const l = m.lengths[n]!
      if (l > room) break
      const mask = m.classMasks[n]!
      let ok = false
      if (mask & 1) {
        if (l <= CROSS_LINE_MAX) ok = true
        else {
          if (lineRoom < 0) lineRoom = this.newline(p) - p
          ok = l <= lineRoom
        }
      }
      if (!ok && (mask & classes)) {
        for (let c = 1; c < rooms.length && !ok; c++) ok = ((mask >>> c) & 1) === 1 && l <= rooms[c]!
      }
      if (ok) eligible.push(l)
    }
    if (eligible.length === 0) return null
    let best: Match | null = null
    const digest = m.hasher.digest
    m.hasher.each(buf, p, eligible, eligible.length, length => {
      const candidates = m.byFirstWord.get(digest[0]!)
      if (!candidates) return
      for (const f of candidates) {
        if (f.length !== length || !sameDigest(f.digest, digest)) continue
        if (!best || best.length < length) best = { length, secretNames: [f.secretName] }
        else if (best.length === length && !best.secretNames.includes(f.secretName)) best.secretNames.push(f.secretName)
      }
    })
    return best
  }
}

function sameDigest(a: Int32Array, b: Int32Array): boolean {
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false
  return true
}
