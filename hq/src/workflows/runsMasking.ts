/**
 * The masking material for a run (workflows spec part 2, *Masking*; core's `protocol/workflowRuns.ts`): for every
 * secret of the place and every minted value that hasn't expired, each form it could be printed in (core's
 * `maskFormsOf`), sent to the site as its length, its class and its HMAC-SHA-256 under a key made for this run —
 * never the value. The site finds a form by the keyed hash of each stretch of output of that length.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { maskFormsOf, type WorkflowMaskForm, type WorkflowMaskingMaterial } from '@agenthix/core'

export function maskFormHmac(key: Buffer, form: Uint8Array): string {
  return createHmac('sha256', key).update(form).digest('hex')
}

/** The material for one run, with a key of its own. The forms are worked out here and dropped once hashed. */
export function buildMaskingMaterial(values: { name: string; value: Uint8Array }[], key: Buffer = randomBytes(32)): WorkflowMaskingMaterial {
  const forms: WorkflowMaskForm[] = []
  const seen = new Set<string>()
  for (const { name, value } of values) {
    for (const form of maskFormsOf(value)) {
      const hmac = maskFormHmac(key, form.bytes)
      const length = form.bytes.length
      const id = `${length}:${hmac}`
      form.bytes.fill(0)
      if (seen.has(id)) continue
      seen.add(id)
      forms.push({ length, hmac, secretName: name, class: form.class })
    }
  }
  return { key: key.toString('base64'), forms }
}
