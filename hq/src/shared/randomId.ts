/**
 * A random version 4 UUID, in the browser as on the server. A browser gives `crypto.randomUUID` only to a secure
 * page (https, or localhost), and hq is also opened over plain http at a network address, so where it is missing the
 * id is made from `crypto.getRandomValues`, which every page has.
 */
export function randomId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
