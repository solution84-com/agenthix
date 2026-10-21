/**
 * Just enough DER (ITU-T X.690) to write a certificate request (csr.ts): Node makes and signs with the key, but has
 * no way to write a PKCS #10 request, and a library for one would be a dependency for forty lines.
 */

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

export const tlv = (tag: number, ...content: Buffer[]): Buffer => {
  const body = Buffer.concat(content)
  return Buffer.concat([Buffer.from([tag]), length(body.length), body])
}

export const sequence = (...items: Buffer[]) => tlv(0x30, ...items)
export const set = (...items: Buffer[]) => tlv(0x31, ...items)
export const integer = (n: number) => tlv(0x02, Buffer.from([n]))
export const octetString = (b: Buffer) => tlv(0x04, b)
export const utf8String = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'))
/** Unused bits always 0: every bit string written here is whole bytes. */
export const bitString = (b: Buffer) => tlv(0x03, Buffer.from([0]), b)
/** `[n]` context-specific: constructed (wrapping DER) or primitive (implicit, the bytes of what it replaces). */
export const contextTag = (n: number, constructed: boolean, b: Buffer) => tlv((constructed ? 0xa0 : 0x80) | n, b)

export function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const bytes = [a! * 40 + b!]
  for (const n of rest) {
    const chunk = [n & 0x7f]
    for (let v = n >>> 7; v > 0; v >>>= 7) chunk.unshift(0x80 | (v & 0x7f))
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}

export function pem(label: string, der: Buffer): string {
  const lines = der.toString('base64').match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}
