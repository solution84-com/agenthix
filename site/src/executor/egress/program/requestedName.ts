/**
 * Which approved host a connection is for, when two approved hosts share its port: every approved name resolves to
 * the proxy's one address, so the port alone can't tell them apart. The proxy reads the start of what the step
 * sends, the server name of a TLS ClientHello or the `Host` of an HTTP/1 request, and passes it on unchanged. A
 * connection that names no approved host on its port is closed.
 *
 * Part of the proxy's program, which runs from these functions' source text: each may use only its arguments,
 * Node's globals and the program's other functions.
 */

/** The name, null when there is none or this isn't a ClientHello, undefined while more bytes are needed. */
export function tlsServerName(buf: Uint8Array): string | null | undefined {
  if (buf.length === 0) return undefined
  if (buf[0] !== 0x16) return null
  // The handshake, gathered from as many records as it spans.
  const parts: Uint8Array[] = []
  let at = 0
  let gathered = 0
  let needed = -1
  while (needed < 0 || gathered < needed) {
    if (at + 5 > buf.length) return undefined
    if (buf[at] !== 0x16) return null
    const len = (buf[at + 3]! << 8) | buf[at + 4]!
    if (at + 5 + len > buf.length) return undefined
    parts.push(buf.subarray(at + 5, at + 5 + len))
    gathered += len
    at += 5 + len
    if (needed < 0 && gathered >= 4) {
      const first = Buffer.concat(parts)
      if (first[0] !== 0x01) return null
      needed = 4 + ((first[1]! << 16) | (first[2]! << 8) | first[3]!)
    }
  }
  const h = Buffer.concat(parts).subarray(4, needed)
  let p = 2 + 32
  const skip = (lenBytes: number): boolean => {
    if (p + lenBytes > h.length) return false
    const n = lenBytes === 1 ? h[p]! : h.readUInt16BE(p)
    p += lenBytes + n
    return p <= h.length
  }
  if (!skip(1) || !skip(2) || !skip(1)) return null
  if (p + 2 > h.length) return null
  const end = Math.min(h.length, p + 2 + h.readUInt16BE(p))
  p += 2
  while (p + 4 <= end) {
    const type = h.readUInt16BE(p)
    const len = h.readUInt16BE(p + 2)
    const data = h.subarray(p + 4, p + 4 + len)
    p += 4 + len
    if (type !== 0) continue
    let q = 2
    while (q + 3 <= data.length) {
      const kind = data[q]!
      const n = data.readUInt16BE(q + 1)
      if (kind === 0 && q + 3 + n <= data.length) return data.toString('latin1', q + 3, q + 3 + n).toLowerCase().replace(/\.$/, '')
      q += 3 + n
    }
    return null
  }
  return null
}

/** The host an HTTP/1 request names, without its port; null when it isn't one, undefined while more is needed. */
export function httpHost(buf: Uint8Array): string | null | undefined {
  const text = Buffer.from(buf.buffer, buf.byteOffset, buf.length).toString('latin1')
  const firstLine = text.indexOf('\r\n')
  if (firstLine < 0) return /^[A-Z]{0,16}( [^ \r\n]*)?( [^\r\n]*)?$/.test(text) ? undefined : null
  if (!/^[A-Z]{1,16} [^ ]+ HTTP\/1\.[01]$/.test(text.slice(0, firstLine)) || text.startsWith('CONNECT ')) return null
  const headEnd = text.indexOf('\r\n\r\n')
  if (headEnd < 0) return undefined
  const m = /\r\nhost:[ \t]*([^\r\n]*?)[ \t]*\r\n/i.exec(text.slice(firstLine, headEnd + 2))
  if (!m) return null
  const value = m[1]!.toLowerCase()
  const host = value.startsWith('[') ? value.slice(0, value.indexOf(']') + 1) : value.split(':')[0]!
  return host.replace(/\.$/, '') || null
}

/** The name a connection's first bytes ask for, by TLS or HTTP/1; null when neither, undefined while more is needed. */
export function requestedName(buf: Uint8Array): string | null | undefined {
  if (buf.length === 0) return undefined
  return buf[0] === 0x16 ? tlsServerName(buf) : httpHost(buf)
}
