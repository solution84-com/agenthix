/**
 * HMAC-SHA-256 of every stretch of bytes that could be a masked form (core's `protocol/workflowRuns.ts`, *Masking
 * material*). The site holds no value, only each form's length and keyed hash, so finding one means hashing the
 * window of that length at every position: one HMAC per position per distinct form length.
 *
 * That is millions of HMACs for a step printing megabytes, so it is done here rather than through `node:crypto`,
 * whose per-call cost is several times one compression. The key's two padded blocks are compressed once (the
 * midstates), so a window of up to 55 bytes costs two compressions: its own block, and the outer hash. Longer
 * windows that start at the same position share their full blocks.
 */
const K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const IV = Int32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])

/** One SHA-256 compression of the 16 words in `w[0..15]` into `st`; `w[16..63]` is scratch. */
function compress(st: Int32Array, w: Int32Array): void {
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15]!, y = w[i - 2]!
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
  }
  let a = st[0]!, b = st[1]!, c = st[2]!, d = st[3]!, e = st[4]!, f = st[5]!, g = st[6]!, h = st[7]!
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0
    const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
  }
  st[0] = (st[0]! + a) | 0; st[1] = (st[1]! + b) | 0; st[2] = (st[2]! + c) | 0; st[3] = (st[3]! + d) | 0
  st[4] = (st[4]! + e) | 0; st[5] = (st[5]! + f) | 0; st[6] = (st[6]! + g) | 0; st[7] = (st[7]! + h) | 0
}

/** The big-endian word at `at` in `buf`, the bytes from `end` on read as zero. */
function wordAt(buf: Uint8Array, at: number, end: number): number {
  if (at + 4 <= end) return (buf[at]! << 24) | (buf[at + 1]! << 16) | (buf[at + 2]! << 8) | buf[at + 3]!
  let v = 0
  for (let k = 0; k < 4; k++) v |= (at + k < end ? buf[at + k]! : 0) << (24 - 8 * k)
  return v
}

export class WindowHasher {
  private readonly inner = new Int32Array(8)
  private readonly outer = new Int32Array(8)
  private readonly w = new Int32Array(64)
  private readonly shared = new Int32Array(8)
  private readonly st = new Int32Array(8)
  /** The digest of the last window hashed, as eight big-endian words. */
  readonly digest = new Int32Array(8)

  constructor(key: Uint8Array) {
    let k = key
    if (k.length > 64) k = sha256(k)
    const ipad = new Uint8Array(64).fill(0x36)
    const opad = new Uint8Array(64).fill(0x5c)
    for (let i = 0; i < k.length; i++) { ipad[i]! ^= k[i]!; opad[i]! ^= k[i]! }
    this.inner.set(IV); this.load(ipad, 0, 64); compress(this.inner, this.w)
    this.outer.set(IV); this.load(opad, 0, 64); compress(this.outer, this.w)
  }

  private load(buf: Uint8Array, at: number, end: number): void {
    for (let i = 0; i < 16; i++) this.w[i] = wordAt(buf, at + 4 * i, end)
  }

  /**
   * Hashes the windows `buf[p, p + lengths[i])` for each length, in ascending order, calling `found` with each
   * length whose digest (`this.digest`) is worth a look. `lengths` must be sorted and fit in `buf`.
   */
  each(buf: Uint8Array, p: number, lengths: readonly number[], count: number, found: (length: number) => void): void {
    const { w, shared, st, digest } = this
    shared.set(this.inner)
    let sharedBlocks = 0
    for (let n = 0; n < count; n++) {
      const length = lengths[n]!
      const full = length >>> 6
      while (sharedBlocks < full) { this.load(buf, p + 64 * sharedBlocks, buf.length); compress(shared, w); sharedBlocks++ }
      st.set(shared)
      const tail = p + 64 * full
      const rest = length & 63
      const end = p + length
      for (let i = 0; i < 16; i++) w[i] = 4 * i < rest ? wordAt(buf, tail + 4 * i, end) : 0
      w[rest >>> 2] = w[rest >>> 2]! | (0x80 << (24 - 8 * (rest & 3)))
      const bits = (64 + length) * 8
      if (rest > 55) {
        compress(st, w)
        w.fill(0, 0, 16)
      }
      w[14] = Math.floor(bits / 0x100000000) | 0
      w[15] = bits | 0
      compress(st, w)
      for (let i = 0; i < 8; i++) w[i] = st[i]!
      w[8] = 0x80000000 | 0
      w.fill(0, 9, 15)
      w[15] = (64 + 32) * 8
      digest.set(this.outer)
      compress(digest, w)
      found(length)
    }
  }
}

/** Plain SHA-256, for a key longer than a block. */
function sha256(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array((((data.length + 9 + 63) >>> 6) << 6))
  padded.set(data)
  padded[data.length] = 0x80
  const bits = data.length * 8
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(bits / 0x100000000))
  dv.setUint32(padded.length - 4, bits >>> 0)
  const st = IV.slice()
  const w = new Int32Array(64)
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(at + 4 * i)
    compress(st, w)
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) odv.setInt32(4 * i, st[i]!)
  return out
}
