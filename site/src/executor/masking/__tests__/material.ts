/**
 * Masking material for tests, made the way hq makes it: core's `maskFormsOf`, each form hashed with HMAC-SHA-256
 * under the run's key. Values are canaries only.
 */
import { createHmac } from 'node:crypto'
import { maskFormsOf, type WorkflowMaskingMaterial } from '@agenthix/core'

export const RUN_KEY = Buffer.from('test-run-key-0123456789abcdef0123')

export function base64Aligned(value: Uint8Array, k: 0 | 1 | 2): Buffer | null {
  const encoded = Buffer.concat([Buffer.alloc(k), Buffer.from(value)]).toString('base64').replace(/=+$/, '')
  const start = Math.ceil((8 * k) / 6)
  const end = Math.floor((8 * (k + value.length)) / 6)
  return end > start ? Buffer.from(encoded.slice(start, end), 'ascii') : null
}

export function material(secrets: Record<string, string | Uint8Array>, key: Buffer = RUN_KEY): WorkflowMaskingMaterial {
  const forms = Object.entries(secrets).flatMap(([name, value]) => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : value
    return maskFormsOf(bytes).map(f => ({
      length: f.bytes.length,
      hmac: createHmac('sha256', key).update(f.bytes).digest('hex'),
      secretName: name,
      class: f.class,
    }))
  })
  return { key: key.toString('base64'), forms }
}
