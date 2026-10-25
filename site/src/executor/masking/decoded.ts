/**
 * Output read as hex, base64 and URL-encoding, so a base64, hex or URL-encoded form can be found by the tag of the
 * value it encodes (core's `protocol/workflowRuns.ts`, *Masking material*). A tag covers the value's bytes from its
 * second, which every one of its encoded forms holds whole: hex and URL-encoding hold every byte, and base64 at any
 * alignment loses bits of the first and last byte only.
 *
 * Each view is made over the whole buffer, bytes outside the encoding read as zero; a window is only looked at inside
 * a run of its class's bytes, so they never count. A tag found here only says where to compute an HMAC.
 */
import { prefixHashes, tagAt, type TagGroup } from './tags'

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const PERCENT = 0x25

const HEX_VALUE = (() => {
  const v = new Int8Array(256).fill(-1)
  for (let i = 0; i < 16; i++) { v['0123456789abcdef'.charCodeAt(i)] = i; v['0123456789ABCDEF'.charCodeAt(i)] = i }
  return v
})()
const BASE64_VALUE = (() => {
  const v = new Uint8Array(256)
  for (let i = 0; i < 64; i++) v[BASE64.charCodeAt(i)] = i
  return v
})()

/**
 * Where a value's second byte starts within each base64 form of it, in bits from the form's first character: at
 * alignment 0, 1 and 2 the form starts at bit 0, 4 and 2 of the value.
 */
export const BASE64_SECOND_BYTE_BITS = [8, 4, 6] as const

/** Hex read from each parity: `[g][j]` is the byte the characters at `g + 2j` and `g + 2j + 1` give. */
export class HexView {
  private readonly grids: Int32Array[]

  constructor(buf: Uint8Array, base: number) {
    this.grids = [0, 1].map(g => {
      const bytes = new Uint8Array(Math.max(0, (buf.length - g) >> 1))
      for (let j = 0; j < bytes.length; j++) {
        bytes[j] = ((HEX_VALUE[buf[g + 2 * j]!]! & 15) << 4) | (HEX_VALUE[buf[g + 2 * j + 1]!]! & 15)
      }
      return prefixHashes(bytes, base)
    })
  }

  /** The tag of a value whose hex form starts at `p`, or -1 when the run, ending at `runEnd`, is too short for it. */
  tag(p: number, g: TagGroup, runEnd: number): number {
    const q = p + 2
    if (q + 2 * g.span > runEnd) return -1
    return tagAt(this.grids[q & 1]!, q >> 1, g)
  }
}

/** Base64 read as bits, from each of the four even bit offsets: `[g / 2][j]` is the byte at bit `g + 8j`. */
export class Base64View {
  private readonly grids: Int32Array[]

  constructor(buf: Uint8Array, base: number) {
    const bits = 6 * buf.length
    const v = (c: number) => (c < buf.length ? BASE64_VALUE[buf[c]!]! : 0)
    this.grids = [0, 2, 4, 6].map(g => {
      const bytes = new Uint8Array(Math.max(0, (bits - g) >> 3))
      for (let j = 0; j < bytes.length; j++) {
        const s = g + 8 * j
        const c = (s / 6) | 0
        const off = s - 6 * c
        const w = (v(c) << 12) | (v(c + 1) << 6) | v(c + 2)
        bytes[j] = (w >>> (10 - off)) & 255
      }
      return prefixHashes(bytes, base)
    })
  }

  /** The tag of a value whose base64 form, at the alignment whose second byte is `secondByteBits` in, starts at `p`. */
  tag(p: number, secondByteBits: number, g: TagGroup, runEnd: number): number {
    const x = 6 * p + secondByteBits
    if (x + 8 * g.span > 6 * runEnd) return -1
    return tagAt(this.grids[(x & 7) >> 1]!, x >> 3, g)
  }
}

/**
 * URL-encoding read front to back: a `%` and two hex digits is one byte, any other byte itself. A form starts on a
 * byte that starts one of these, so where the reading puts `p` inside a `%` and its digits, the form there can't be
 * found by its tag, and `tag` says so.
 */
export class UrlView {
  /** For each position, how many bytes the reading has given before it, or -1 inside a `%` and its digits. */
  private readonly at: Int32Array
  private readonly prefix: Int32Array

  constructor(buf: Uint8Array, base: number) {
    this.at = new Int32Array(buf.length + 1).fill(-1)
    const bytes = new Uint8Array(buf.length)
    let n = 0
    for (let i = 0; i < buf.length;) {
      this.at[i] = n
      if (buf[i] === PERCENT && i + 2 < buf.length && HEX_VALUE[buf[i + 1]!]! >= 0 && HEX_VALUE[buf[i + 2]!]! >= 0) {
        bytes[n++] = (HEX_VALUE[buf[i + 1]!]! << 4) | HEX_VALUE[buf[i + 2]!]!
        i += 3
      } else {
        bytes[n++] = buf[i]!
        i++
      }
    }
    this.at[buf.length] = n
    this.prefix = prefixHashes(bytes.subarray(0, n), base)
  }

  /** The tag of a value whose URL-encoded form starts at `p`; -1 when there is no room, -2 when `p` is inside a `%`. */
  tag(p: number, g: TagGroup): number {
    const d = this.at[p]!
    if (d < 0) return -2
    if (d + 1 + g.span >= this.prefix.length) return -1
    return tagAt(this.prefix, d + 1, g)
  }
}
