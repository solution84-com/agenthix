/**
 * What the store accepts (spec part 3): names by core's rules, every secret saying what it is (S3), a value of text
 * or a file of up to 48 KB, kept byte for byte, and a variable's value as plain text. Pure, so the store and the
 * screens share one rule.
 */
import { validateStoredSecretName, validateVariableName } from '@agenthix/core'
import type { PlaceSecretKind } from '@prisma/client'
import { refuse } from './refusal'

export const SECRET_VALUE_BYTES_MAX = 48 * 1024
export const SECRET_DESCRIPTION_MAX = 500
export const SECRET_ISSUER_MAX = 200
export const SECRET_RENEW_AT_MAX = 500
export const VARIABLE_VALUE_MAX = 4096

/** A value as it arrives from the form: typed text, or a file's bytes in base64. */
export type SecretValueInput = { kind: 'text'; text: string } | { kind: 'file'; base64: string }

export type SecretDescription = {
  description: string
  issuer: string
  renewAt: string
  rotateBy: Date | null
}

export function checkSecretName(name: string): void {
  const named = validateStoredSecretName(name)
  if (!named.ok) refuse('invalid', named.reason ?? 'That is not a secret name.')
}

export function checkVariableName(name: string): void {
  const named = validateVariableName(name)
  if (!named.ok) refuse('invalid', named.reason ?? 'That is not a variable name.')
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** The value's bytes and kind, refused when empty or over 48 KB. A typed value is kept exactly as typed. */
export function secretValueBytes(input: SecretValueInput): { kind: PlaceSecretKind; bytes: Buffer } {
  let bytes: Buffer
  if (input.kind === 'text') {
    if (typeof input.text !== 'string') refuse('invalid', 'The secret has no value: type it or choose a file.')
    bytes = Buffer.from(input.text, 'utf8')
  } else if (input.kind === 'file') {
    const b64 = typeof input.base64 === 'string' ? input.base64.replace(/\s+/g, '') : ''
    if (b64.length % 4 !== 0 || !BASE64.test(b64)) refuse('invalid', 'The file did not arrive whole: choose it again.')
    bytes = Buffer.from(b64, 'base64')
  } else {
    refuse('invalid', 'The secret has no value: type it or choose a file.')
  }
  if (bytes.length === 0) refuse('invalid', 'The secret has no value: type it or choose a file.')
  if (bytes.length > SECRET_VALUE_BYTES_MAX) {
    refuse('invalid', `The value is ${Math.ceil(bytes.length / 1024)} KB; a secret holds at most 48 KB.`)
  }
  return { kind: input.kind === 'file' ? 'FILE' : 'TEXT', bytes }
}

function plainLine(value: unknown, field: string, max: number, required: boolean): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (required && !s) refuse('invalid', `Say ${field}: every secret says what it is and what it reaches.`)
  if (s.length > max) refuse('invalid', `${field[0].toUpperCase()}${field.slice(1)} is at most ${max} characters.`)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)) refuse('invalid', `${field[0].toUpperCase()}${field.slice(1)} can't hold control characters.`)
  return s
}

export function checkDescription(d: Partial<SecretDescription>): SecretDescription {
  const rotateBy = d.rotateBy == null ? null : new Date(d.rotateBy)
  if (rotateBy && Number.isNaN(rotateBy.getTime())) refuse('invalid', 'The rotate-by date is not a date.')
  return {
    description: plainLine(d.description, 'what it is and what it reaches', SECRET_DESCRIPTION_MAX, true),
    issuer: plainLine(d.issuer, 'who issues it', SECRET_ISSUER_MAX, false),
    renewAt: plainLine(d.renewAt, 'where to get a new one', SECRET_RENEW_AT_MAX, false),
    rotateBy,
  }
}

/** A variable's value: plain text that every step gets as an environment variable, so no NUL byte. */
export function checkVariableValue(value: unknown): string {
  if (typeof value !== 'string') refuse('invalid', 'The variable has no value.')
  if (value.length > VARIABLE_VALUE_MAX) refuse('invalid', `A variable's value is at most ${VARIABLE_VALUE_MAX} characters.`)
  if (value.includes('\u0000')) refuse('invalid', "A variable's value can't hold a NUL character.")
  return value
}
