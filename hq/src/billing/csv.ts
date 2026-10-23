/**
 * The export's lines (part 5, R4): one call cost per line, the row's fields with names in place of ids. A cell that a
 * spreadsheet would read as a formula is prefixed with `'`, since names are typed by people.
 */
import { MICROS_PER_UNIT } from '@agenthix/core'

export const CSV_COLUMNS = [
  'time_utc', 'call_id', 'purpose', 'billing_profile', 'project', 'agent', 'person', 'provider', 'model',
  'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'audio_ms', 'characters',
  'basis', 'amount', 'currency', 'price',
] as const

export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvLine(values: readonly (string | number | null)[]): string {
  return `${values.map(csvCell).join(',')}\r\n`
}

/** Millionths as a decimal amount, exactly: `-1500` is `-0.001500`. */
export function microsToDecimal(micros: bigint): string {
  const negative = micros < 0n
  const abs = negative ? -micros : micros
  const unit = BigInt(MICROS_PER_UNIT)
  return `${negative ? '-' : ''}${abs / unit}.${String(abs % unit).padStart(6, '0')}`
}
