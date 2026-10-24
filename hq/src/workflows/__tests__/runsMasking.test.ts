import { describe, it, expect } from 'vitest'
import { maskFormsOf, maskFormTag, WORKFLOW_MASK_FORM_CLASSES } from '@agenthix/core'
import { buildMaskingMaterial, maskFormHmac } from '../runsMasking'

const CANARY = Buffer.from('canary-value-0123456789', 'utf8')

/** Whether some form of the value appears in the output, as the site would find it. */
function found(output: Buffer, value: Buffer): boolean {
  return maskFormsOf(value).some((f) => output.includes(Buffer.from(f.bytes)))
}

describe('the forms a value is masked in, against Node’s own encodings', () => {
  it('finds the value as it is', () => {
    expect(found(Buffer.from(`token: ${CANARY} end`), CANARY)).toBe(true)
  })

  it('finds it inside a longer base64 string at each of the three alignments', () => {
    for (const before of ['', 'a', 'ab', 'abc', 'user:']) {
      for (const after of ['', 'x', 'xyz']) {
        const encoded = Buffer.from(Buffer.from(`${before}${CANARY}${after}`).toString('base64'))
        expect(found(Buffer.from(`Authorization: Basic ${encoded}`), CANARY), `${before}|${after}`).toBe(true)
      }
    }
  })

  it('finds it in hex, in both cases, and URL-encoded', () => {
    const value = Buffer.from('p@ss w/rd:42!')
    expect(found(Buffer.from(value.toString('hex')), value)).toBe(true)
    expect(found(Buffer.from(value.toString('hex').toUpperCase()), value)).toBe(true)
    expect(found(Buffer.from(`postgres://u:${encodeURIComponent(value.toString())}@db/x`), value)).toBe(true)
  })

  it('finds each line of a key file on its own', () => {
    const key = Buffer.from('-----BEGIN KEY-----\r\nAAAAB3NzaC1yc2EAAAADAQAB\nZm9vYmFyYmF6cXV4\n-----END KEY-----\n')
    expect(found(Buffer.from('half printed: Zm9vYmFyYmF6cXV4'), key)).toBe(true)
  })
})

describe('the masking material sent to the site', () => {
  it('holds lengths and keyed hashes, never a value in any form', () => {
    const key = Buffer.alloc(32, 7)
    const material = buildMaskingMaterial([{ name: 'STAGING_DEPLOY_KEY', value: Buffer.from(CANARY) }], Buffer.from(key))
    const wire = JSON.stringify(material)
    for (const form of maskFormsOf(CANARY)) expect(wire.includes(Buffer.from(form.bytes).toString('utf8'))).toBe(false)
    expect(wire.includes(CANARY.toString('base64'))).toBe(false)
    expect(material.key).toBe(key.toString('base64'))
    expect(material.forms.every((f) => /^[0-9a-f]{64}$/.test(f.hmac) && f.secretName === 'STAGING_DEPLOY_KEY')).toBe(true)
    expect(material.forms.every((f) => f.class && WORKFLOW_MASK_FORM_CLASSES.includes(f.class))).toBe(true)
    expect(material.forms[0]).toEqual({
      length: CANARY.length, hmac: maskFormHmac(key, CANARY), secretName: 'STAGING_DEPLOY_KEY', class: 'raw',
      ...maskFormTag(CANARY, material.tagBase!),
    })
    expect(material.forms.map((f) => f.class)).toEqual(maskFormsOf(CANARY).map((f) => f.class))
  })

  it('hashes each line of a key file as it is, and leaves the value it was given unchanged', () => {
    const key = Buffer.alloc(32, 3)
    const value = Buffer.from('-----BEGIN KEY-----\nab\nAAAAB3NzaC1yc2EAAAADAQAB\n-----END KEY-----\n')
    const before = Buffer.from(value)
    const material = buildMaskingMaterial([{ name: 'KEY', value }], key)
    expect(Buffer.compare(value, before)).toBe(0)
    const hmacs = material.forms.map((f) => f.hmac)
    for (const part of [before, Buffer.from('AAAAB3NzaC1yc2EAAAADAQAB'), Buffer.from('-----END KEY-----')]) {
      expect(hmacs).toContain(maskFormHmac(key, part))
    }
  })

  it('tags raw forms, and encoded forms of a value that is a raw form, under an odd base of 32 bits', () => {
    const material = buildMaskingMaterial([{ name: 'A', value: Buffer.from(CANARY) }])
    expect(Number.isInteger(material.tagBase) && material.tagBase! % 2 === 1 && material.tagBase! < 2 ** 32).toBe(true)
    expect(material.forms.every((f) => f.tag !== undefined && f.tagSpan !== undefined)).toBe(true)
    const short = buildMaskingMaterial([{ name: 'B', value: Buffer.from('abc') }])
    expect(short.forms.length).toBeGreaterThan(0)
    expect(short.forms.every((f) => f.tag === undefined)).toBe(true)
  })

  it('uses a new key and a new tag base for each run', () => {
    const a = buildMaskingMaterial([{ name: 'A', value: Buffer.from(CANARY) }])
    const b = buildMaskingMaterial([{ name: 'A', value: Buffer.from(CANARY) }])
    expect(a.key).not.toBe(b.key)
    expect(a.tagBase).not.toBe(b.tagBase)
    expect(a.forms[0].hmac).not.toBe(b.forms[0].hmac)
  })
})
