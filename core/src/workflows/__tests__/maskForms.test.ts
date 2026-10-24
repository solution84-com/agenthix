import { describe, expect, it } from 'vitest'
import { MASK_FORM_MIN_BYTES, maskFormsOf, maskFormTag } from '../maskForms.js'
import { WORKFLOW_MASK_FORM_CLASS_BYTES, WORKFLOW_MASK_TAG_SPAN_MAX } from '../../protocol/workflowRuns.js'

const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const text = (b: Uint8Array) => String.fromCharCode(...b)
const forms = (s: string | Uint8Array) => maskFormsOf(typeof s === 'string' ? bytes(s) : s).map(f => ({ text: text(f.bytes), class: f.class }))

describe('the forms a value is masked in', () => {
  it('makes each kind once, in order, with its class', () => {
    expect(forms('p@ss w/rd')).toEqual([
      { text: 'p@ss w/rd', class: 'raw' },
      { text: 'cEBzcyB3L3Jk', class: 'base64' },
      { text: 'BAc3Mgdy9yZ', class: 'base64' },
      { text: 'wQHNzIHcvcm', class: 'base64' },
      { text: '7040737320772f7264', class: 'hex' },
      { text: '7040737320772F7264', class: 'hex' },
      { text: 'p%40ss%20w%2Frd', class: 'url' },
    ])
  })

  it('URL-encodes strictly and as encodeURIComponent does', () => {
    expect(forms("it's!").filter(f => f.class === 'url').map(f => f.text)).toEqual(['it%27s%21'])
    expect(forms("a b'c").filter(f => f.class === 'url').map(f => f.text)).toEqual(['a%20b%27c', "a%20b'c"])
  })

  it('keeps every form within its class, for any bytes', () => {
    const value = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 255)
    for (const f of maskFormsOf(value)) {
      if (f.class === 'raw') continue
      const allowed = WORKFLOW_MASK_FORM_CLASS_BYTES[f.class]
      expect([...f.bytes].every(b => allowed.includes(String.fromCharCode(b))), f.class).toBe(true)
    }
  })

  it('keeps the first kind where two kinds give the same bytes', () => {
    const f = forms('abcd1234')
    expect(f.filter(x => x.text === 'abcd1234')).toEqual([{ text: 'abcd1234', class: 'raw' }])
  })

  it('adds each line of a value of several lines, a carriage return dropped', () => {
    const f = forms('-----BEGIN KEY-----\r\nZm9vYmFyYmF6cXV4\n-----END KEY-----\n')
    expect(f).toContainEqual({ text: 'Zm9vYmFyYmF6cXV4', class: 'raw' })
    expect(f).toContainEqual({ text: '-----BEGIN KEY-----', class: 'raw' })
  })

  it('copies what it is given, so zeroing a form changes neither the value nor another form', () => {
    // Like a Node Buffer, whose slice is a view of the same bytes: the case hq has.
    class Viewing extends Uint8Array {
      override slice(start?: number, end?: number) { return this.subarray(start, end) }
    }
    const source = 'ab\nline-one-of-the-key\nline-one-of-the-key\n'
    const given = Viewing.from(bytes(source))
    const f = maskFormsOf(given, 7)
    expect(text(given)).toBe(source)
    expect(f.map(x => text(x.bytes))).toContain(source)
    expect(f.map(x => text(x.bytes))).toContain('line-one-of-the-key')
    for (const x of f) x.bytes.fill(0)
    expect(text(given)).toBe(source)
  })

  it('leaves out forms too short to mask, and repeats', () => {
    const f = maskFormsOf(bytes('abcdefgh'))
    expect(f.every(x => x.bytes.length >= MASK_FORM_MIN_BYTES)).toBe(true)
    expect(new Set(f.map(x => text(x.bytes))).size).toBe(f.length)
    expect(maskFormsOf(bytes('a'))).toEqual([])
  })
})

/** The tag worked out with exact integers, to check the 32-bit arithmetic. */
function referenceTag(value: Uint8Array, base: number): { tag: number; tagSpan: number } {
  const tagSpan = Math.min(value.length - 2, WORKFLOW_MASK_TAG_SPAN_MAX)
  let h = 0n
  for (let i = 1; i <= tagSpan; i++) h = (h * BigInt(base) + BigInt(value[i]!)) % 2n ** 32n
  return { tag: Number(h >> 20n), tagSpan }
}

describe('the tag of a form', () => {
  it('is the top 12 bits of the polynomial hash of up to 16 bytes from the second, for any base', () => {
    for (const base of [1, 3, 0x9e3779b1, 0xffffffff]) {
      for (const s of ['abc', 'abcd', 'canary-7f3a9c1e-deploy-key', '\xff\xfe\x00\x80 wide bytes here, long enough']) {
        expect(maskFormTag(bytes(s), base), `${base} ${s}`).toEqual(referenceTag(bytes(s), base))
      }
    }
    expect(maskFormTag(bytes('canary-7f3a9c1e-deploy-key'), 5).tagSpan).toBe(16)
    expect(maskFormTag(bytes('abcdef'), 5).tagSpan).toBe(4)
    expect(() => maskFormTag(bytes('ab'), 5)).toThrow()
  })

  it('is only given a base; a raw form carries its own, an encoded form that of the raw form it encodes', () => {
    const value = bytes('-----BEGIN KEY-----\nZm9vYmFyYmF6cXV4\n-----END KEY-----\n')
    expect(maskFormsOf(value).every(f => f.tag === undefined && f.tagSpan === undefined)).toBe(true)
    const all = maskFormsOf(value, 0x9e3779b1)
    const rawTags = all.filter(f => f.class === 'raw').map(f => JSON.stringify(referenceTag(f.bytes, 0x9e3779b1)))
    for (const f of all) {
      if (f.class === 'raw') expect({ tag: f.tag, tagSpan: f.tagSpan }).toEqual(referenceTag(f.bytes, 0x9e3779b1))
      else expect(rawTags, text(f.bytes)).toContain(JSON.stringify({ tag: f.tag, tagSpan: f.tagSpan }))
    }
    const line = all.find(f => text(f.bytes) === '2d2d2d2d2d454e44204b45592d2d2d2d2d')!
    expect({ tag: line.tag, tagSpan: line.tagSpan }).toEqual(referenceTag(bytes('-----END KEY-----'), 0x9e3779b1))
  })

  it('is on no encoded form whose value has no raw form, so it gives away no tag the material lacks', () => {
    const short = maskFormsOf(bytes('abc'), 7)
    expect(short.length).toBeGreaterThan(0)
    expect(short.every(f => f.class !== 'raw' && f.tag === undefined)).toBe(true)
  })
})
