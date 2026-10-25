/**
 * The masking material for a run (workflows spec part 2, *Masking*; core's `protocol/workflowRuns.ts`): for every
 * secret of the place and every minted value that hasn't expired, each form it could be printed in (core's
 * `maskFormsOf`), sent to the site as its length, its class and its HMAC-SHA-256 under a key made for this run —
 * never the value — and, for a raw form, its short tag under a base made for this run. The site finds a form by the
 * keyed hash of each stretch of output of that length, hashing only where the tag matches.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { maskFormsOf, type WorkflowMaskForm, type WorkflowMaskingMaterial } from '@agenthix/core'

export function maskFormHmac(key: Buffer, form: Uint8Array): string {
  return createHmac('sha256', key).update(form).digest('hex')
}

/** The material for one run, with a key of its own. The forms are worked out here and dropped once hashed. */
/** An odd base below 2^32, so no power of it is zero modulo 2^32. */
function newTagBase(): number {
  return (randomBytes(4).readUInt32BE(0) | 1) >>> 0
}

export function buildMaskingMaterial(
  values: { name: string; value: Uint8Array }[],
  key: Buffer = randomBytes(32),
  tagBase: number = newTagBase(),
): WorkflowMaskingMaterial {
  const forms: WorkflowMaskForm[] = []
  const seen = new Set<string>()
  for (const { name, value } of values) {
    for (const form of maskFormsOf(value, tagBase)) {
      const hmac = maskFormHmac(key, form.bytes)
      const length = form.bytes.length
      const id = `${length}:${hmac}`
      form.bytes.fill(0)
      if (seen.has(id)) continue
      seen.add(id)
      const tag = form.tag === undefined ? {} : { tag: form.tag, tagSpan: form.tagSpan }
      forms.push({ length, hmac, secretName: name, class: form.class, ...tag })
    }
  }
  return { key: key.toString('base64'), forms, tagBase }
}
