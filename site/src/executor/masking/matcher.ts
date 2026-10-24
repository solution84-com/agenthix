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
 *
 * A form with a tag is hashed only where the rolling hash of the output matches its tag (`tags.ts`), one look per
 * tag span at each position whatever the number of lengths: for a raw form, of the output as it is; for any other, of
 * the output decoded (`decoded.ts`). A form without a tag is hashed at every position it could be at.
 */
import { WORKFLOW_MASK_FORM_CLASS_BYTES, WORKFLOW_MASK_FORM_CLASSES, type WorkflowMaskFormClass, type WorkflowMaskingMaterial } from '@agenthix/core'
import { WindowHasher } from './hmacWindows'
import { Base64View, BASE64_SECOND_BYTE_BITS, HexView, UrlView } from './decoded'
import { hasTag, prefixHashes, TagGroups, tagAt, validTagBase, type TagGroup } from './tags'

export const CROSS_LINE_MAX = 256
const NEWLINE = 0x0a
const RAW = 0
const BASE64 = WORKFLOW_MASK_FORM_CLASSES.indexOf('base64')
const HEX = WORKFLOW_MASK_FORM_CLASSES.indexOf('hex')
const URL = WORKFLOW_MASK_FORM_CLASSES.indexOf('url')

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
  /** For each class, the lengths with a form that carries no tag, and so is hashed wherever it could be. */
  readonly untagged: number[][]
  /** For each class, its forms' tags, or null when none has one. */
  readonly tags: (TagGroups | null)[]
  readonly maxLength: number

  constructor(material: WorkflowMaskingMaterial) {
    this.hasher = new WindowHasher(Buffer.from(material.key, 'base64'))
    const base = material.tagBase
    if (base !== undefined && !validTagBase(base)) throw new Error('The masking material has a tag base that is not one.')
    const byClass = WORKFLOW_MASK_FORM_CLASSES.map(() => new Set<number>())
    const untagged = WORKFLOW_MASK_FORM_CLASSES.map(() => new Set<number>())
    const tags = WORKFLOW_MASK_FORM_CLASSES.map(() => (base === undefined ? null : new TagGroups(base)))
    for (const f of material.forms) {
      const cls = WORKFLOW_MASK_FORM_CLASSES.indexOf(f.class ?? 'raw')
      if (!Number.isInteger(f.length) || f.length < 1 || !/^[0-9a-f]{64}$/i.test(f.hmac) || cls < 0) {
        throw new Error('The masking material has a form that is not a length, an HMAC-SHA-256 and a class.')
      }
      const tagged = hasTag(f)
      if (cls === RAW && tagged && f.tagSpan! > f.length - 2) throw new Error('The masking material has a tag longer than its form.')
      const digest = new Int32Array(8)
      for (let i = 0; i < 8; i++) digest[i] = Number.parseInt(f.hmac.slice(8 * i, 8 * i + 8), 16) | 0
      const list = this.byFirstWord.get(digest[0]!) ?? []
      list.push({ length: f.length, digest, secretName: f.secretName })
      this.byFirstWord.set(digest[0]!, list)
      byClass[cls]!.add(f.length)
      if (tagged && tags[cls]) tags[cls]!.add(f.tag!, f.tagSpan!, f.length)
      else untagged[cls]!.add(f.length)
    }
    const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b)
    this.lengthsByClass = byClass.map(sorted)
    this.untagged = untagged.map(sorted)
    this.tags = tags.map(t => (t && !t.empty ? t : null))
    this.maxLength = Math.max(0, ...this.lengthsByClass.map(ls => ls.at(-1) ?? 0))
  }

  get empty(): boolean {
    return this.maxLength === 0
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
  /** The lengths worth hashing at the position being matched, and whether they are still in order. */
  private readonly eligible: number[] = []
  private inOrder = true
  private readonly rawCross: number
  private readonly rawLong: number
  private readonly classMax: number[]
  /** The rolling hash of each prefix of the buffer, and the buffer decoded, for each class with a tag. */
  private readonly prefix: Int32Array | null
  private readonly base64: Base64View | null
  private readonly hex: HexView | null
  private readonly url: UrlView | null

  constructor(private readonly m: FormMatcher, private readonly buf: Uint8Array) {
    this.runEnd = new Int32Array(CLASSES.length).fill(-1)
    const raw = m.lengthsByClass[RAW]!
    this.rawCross = raw.filter(l => l <= CROSS_LINE_MAX).at(-1) ?? 0
    this.rawLong = raw.at(-1) ?? 0
    this.classMax = CLASSES.map((_, i) => m.lengthsByClass[i + 1]!.at(-1) ?? 0)
    const t = m.tags
    this.prefix = t[RAW] ? prefixHashes(buf, t[RAW].base) : null
    this.base64 = t[BASE64] ? new Base64View(buf, t[BASE64].base) : null
    this.hex = t[HEX] ? new HexView(buf, t[HEX].base) : null
    this.url = t[URL] ? new UrlView(buf, t[URL].base) : null
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

  /** Whether a raw form of length `l` could be at `p`: it fits, and holds no newline unless it is short. */
  private rawFits(p: number, l: number): boolean {
    if (p + l > this.buf.length) return false
    return l <= CROSS_LINE_MAX || l <= this.newline(p) - p
  }

  /** Adds the lengths up to `room` from a sorted list. */
  private addUpTo(ls: readonly number[], room: number): void {
    const { eligible } = this
    const before = eligible.length
    for (const l of ls) {
      if (l > room) break
      eligible.push(l)
    }
    if (before && eligible.length > before) this.inOrder = false
  }

  /** Adds the lengths up to `room` of the forms of group `g` with tag `t`. */
  private addTagged(g: TagGroup, t: number, room: number): void {
    const ls = t < 0 ? undefined : g.lengths[t]
    if (ls) { this.inOrder = false; this.addUpTo(ls, room) }
  }

  /** The longest form found at `p`, looking only at windows that end within the buffer. */
  matchAt(p: number): Match | null {
    const { m, eligible } = this
    eligible.length = 0
    this.inOrder = true
    const room = this.buf.length - p
    for (const l of m.untagged[RAW]!) {
      if (l > room) break
      if (this.rawFits(p, l)) eligible.push(l)
    }
    const rawTags = m.tags[RAW]
    if (rawTags) {
      for (const g of rawTags.groups) {
        if (g.span + 1 >= room) break
        const ls = g.lengths[tagAt(this.prefix!, p + 1, g)]
        if (!ls) continue
        if (eligible.length) this.inOrder = false
        for (const l of ls) if (this.rawFits(p, l)) eligible.push(l)
        this.inOrder = false
      }
    }
    for (let i = 0; i < CLASSES.length; i++) {
      if (!this.classMax[i]) continue
      const end = this.run(i, p)
      if (end > p) this.classAt(i + 1, p, end)
    }
    if (eligible.length === 0) return null
    if (!this.inOrder && eligible.length > 1) sortUnique(eligible)
    return this.hashed(p)
  }

  /** Adds the lengths of class `cls` worth hashing at `p`, inside its run of bytes ending at `end`. */
  private classAt(cls: number, p: number, end: number): void {
    const room = end - p
    this.addUpTo(this.m.untagged[cls]!, room)
    const tags = this.m.tags[cls]
    if (!tags) return
    for (const g of tags.groups) {
      if (cls === BASE64) for (const bits of BASE64_SECOND_BYTE_BITS) this.addTagged(g, this.base64!.tag(p, bits, g, end), room)
      else if (cls === HEX) this.addTagged(g, this.hex!.tag(p, g, end), room)
      else {
        const t = this.url!.tag(p, g)
        // Inside a `%` and its digits, as the output was read: no tag to go by, so every length is hashed.
        if (t === -2) { this.inOrder = false; this.addUpTo(tags.lengths, room) } else this.addTagged(g, t, room)
      }
    }
  }

  private hashed(p: number): Match | null {
    const { m, buf, eligible } = this
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

/** Sorts a short list of lengths and drops repeats, in place. */
function sortUnique(a: number[]): void {
  a.sort((x, y) => x - y)
  let n = 0
  for (let i = 0; i < a.length; i++) if (i === 0 || a[i] !== a[n - 1]) a[n++] = a[i]!
  a.length = n
}

function sameDigest(a: Int32Array, b: Int32Array): boolean {
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false
  return true
}
