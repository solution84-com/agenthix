/**
 * The forms a secret's value is masked in (workflows spec part 2, *Masking*; `protocol/workflowRuns.ts`, *Masking
 * material*), made here so hq and the site's tests make them one way. hq hashes each under the run's key and sends
 * only its length, hash and class.
 *
 * The forms of a value: as it is; base64 at all three alignments, so it is found inside a longer base64 string;
 * hex in lower and upper case; URL-encoded, strictly (RFC 3986) and as `encodeURIComponent` does; and each line of a
 * value that has several (a key file). Base64 at alignment k is the run of characters that depend only on the value's
 * own bytes when k bytes come before it, so whatever surrounds it, those characters are the same.
 */
import { WORKFLOW_MASK_TAG_BITS, WORKFLOW_MASK_TAG_SPAN_MAX, type WorkflowMaskFormClass } from '../protocol/workflowRuns.js'

/** Shorter than this, a form would mask ordinary output: a one-letter secret would hide every such letter. */
export const MASK_FORM_MIN_BYTES = 4

export type MaskFormTag = { tag: number; tagSpan: number }
export type MaskFormBytes = { bytes: Uint8Array; class: WorkflowMaskFormClass } & Partial<MaskFormTag>

/**
 * The tag of a value (`protocol/workflowRuns.ts`, *Masking material*): the top bits of the polynomial hash, modulo
 * 2^32 under `base`, of up to `WORKFLOW_MASK_TAG_SPAN_MAX` of its bytes from its second. The first byte is left out,
 * and so is the last, so the tag can be rolled along output from a fixed point near a form's start.
 */
export function maskFormTag(value: Uint8Array, base: number): MaskFormTag {
  const tagSpan = Math.min(value.length - 2, WORKFLOW_MASK_TAG_SPAN_MAX)
  if (tagSpan < 1) throw new Error('A tag needs a value of at least three bytes.')
  let h = 0
  for (let i = 1; i <= tagSpan; i++) h = (Math.imul(h, base) + value[i]!) | 0
  return { tag: h >>> (32 - WORKFLOW_MASK_TAG_BITS), tagSpan }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const HEX = '0123456789abcdef'
const UNRESERVED = /[A-Za-z0-9\-._~]/
const COMPONENT_UNRESERVED = /[A-Za-z0-9\-._~!'()*]/

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

/** Base64 without padding. */
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6))
    for (let c = 0; c < chars; c++) out += BASE64[(n >>> (18 - 6 * c)) & 63]
  }
  return out
}

function base64Aligned(value: Uint8Array, k: 0 | 1 | 2): Uint8Array | null {
  const shifted = new Uint8Array(k + value.length)
  shifted.set(value, k)
  const encoded = base64(shifted)
  const start = Math.ceil((8 * k) / 6)
  const end = Math.floor((8 * (k + value.length)) / 6)
  return end > start ? ascii(encoded.slice(start, end)) : null
}

function hex(value: Uint8Array): string {
  let out = ''
  for (const byte of value) out += HEX[byte >>> 4]! + HEX[byte & 15]!
  return out
}

function urlEncoded(value: Uint8Array, unreserved: RegExp): Uint8Array {
  let out = ''
  for (const byte of value) {
    const ch = String.fromCharCode(byte)
    out += byte < 0x80 && unreserved.test(ch) ? ch : `%${hex(Uint8Array.of(byte)).toUpperCase()}`
  }
  return ascii(out)
}

/** A form, and the value it encodes. */
type Encoding = { form: MaskFormBytes; value: Uint8Array }

function encodingsOf(value: Uint8Array): Encoding[] {
  const h = hex(value)
  const forms: MaskFormBytes[] = [{ bytes: value.slice(), class: 'raw' }]
  for (const k of [0, 1, 2] as const) {
    const b = base64Aligned(value, k)
    if (b) forms.push({ bytes: b, class: 'base64' })
  }
  forms.push({ bytes: ascii(h), class: 'hex' }, { bytes: ascii(h.toUpperCase()), class: 'hex' })
  forms.push({ bytes: urlEncoded(value, UNRESERVED), class: 'url' }, { bytes: urlEncoded(value, COMPONENT_UNRESERVED), class: 'url' })
  return forms.map(form => ({ form, value }))
}

function linesOf(value: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = []
  let from = 0
  for (let i = 0; i <= value.length; i++) {
    if (i === value.length || value[i] === 0x0a) {
      let end = i
      if (end > from && value[end - 1] === 0x0d) end--
      lines.push(value.slice(from, end))
      from = i + 1
    }
  }
  return lines.length > 1 ? lines : []
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Every form of one value, distinct and long enough to mask. Where two kinds give the same bytes (a value of
 * unreserved characters is its own URL encoding), the first kind's form is kept, so a form's class depends only on
 * its kind.
 *
 * Given the run's tag base, each raw form carries its tag, and each encoded form carries the tag of the value it
 * encodes, which the site finds by decoding its output. An encoded form is tagged only when that value is itself a
 * raw form here, so its tag is one the material already holds and gives away nothing more.
 */
export function maskFormsOf(given: Uint8Array, tagBase?: number): MaskFormBytes[] {
  // A copy, and a plain Uint8Array: a Node Buffer's `slice` is a view, so the forms below would share the caller's
  // bytes, and zeroing one (here, or by the caller once hashed) would change the value and the forms made after it.
  const value = new Uint8Array(given)
  const lines = linesOf(value)
  const all = [...encodingsOf(value), ...lines.flatMap(encodingsOf)]
  const kept: Encoding[] = []
  for (const e of all) {
    if (e.form.bytes.length < MASK_FORM_MIN_BYTES || kept.some(k => sameBytes(k.form.bytes, e.form.bytes))) {
      e.form.bytes.fill(0)
      continue
    }
    kept.push(e)
  }
  if (tagBase !== undefined) {
    for (const { form, value: encoded } of kept) {
      if (kept.some(k => k.form.class === 'raw' && sameBytes(k.form.bytes, encoded))) Object.assign(form, maskFormTag(encoded, tagBase))
    }
  }
  value.fill(0)
  for (const line of lines) line.fill(0)
  return kept.map(k => k.form)
}
