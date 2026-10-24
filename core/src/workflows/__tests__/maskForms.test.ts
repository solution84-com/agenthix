import { describe, expect, it } from 'vitest'
import { MASK_FORM_MIN_BYTES, maskFormsOf } from '../maskForms.js'
import { WORKFLOW_MASK_FORM_CLASS_BYTES } from '../../protocol/workflowRuns.js'

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

  it('leaves out forms too short to mask, and repeats', () => {
    const f = maskFormsOf(bytes('abcdefgh'))
    expect(f.every(x => x.bytes.length >= MASK_FORM_MIN_BYTES)).toBe(true)
    expect(new Set(f.map(x => text(x.bytes))).size).toBe(f.length)
    expect(maskFormsOf(bytes('a'))).toEqual([])
  })
})
