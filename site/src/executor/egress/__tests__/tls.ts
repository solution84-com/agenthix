/** A minimal TLS 1.2-shaped ClientHello, with or without a server name, in one record or split across two. */
export function clientHello(name: string | null, opts: { split?: boolean } = {}): Buffer {
  const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b }
  const extensions: Buffer[] = [Buffer.concat([u16(0x000b), u16(2), Buffer.from([1, 0])])]
  if (name !== null) {
    const host = Buffer.from(name, 'latin1')
    const entry = Buffer.concat([Buffer.from([0]), u16(host.length), host])
    extensions.unshift(Buffer.concat([u16(0), u16(entry.length + 2), u16(entry.length), entry]))
  }
  const ext = Buffer.concat(extensions)
  const body = Buffer.concat([
    Buffer.from([3, 3]), Buffer.alloc(32, 7), Buffer.from([0]), u16(2), u16(0x1301), Buffer.from([1, 0]),
    u16(ext.length), ext,
  ])
  const handshake = Buffer.concat([Buffer.from([1, 0, body.length >> 8, body.length & 255]), body])
  const record = (part: Buffer) => Buffer.concat([Buffer.from([0x16, 3, 1]), u16(part.length), part])
  if (!opts.split) return record(handshake)
  return Buffer.concat([record(handshake.subarray(0, 20)), record(handshake.subarray(20))])
}
