/** DNS messages for the egress tests: a query, and the parts of an answer the tests look at. */
export function dnsQuery(name: string, type = 1, id = 0x1234): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  header.writeUInt16BE(0x0100, 2)
  header.writeUInt16BE(1, 4)
  const labels = name.split('.').filter(Boolean).map(l => Buffer.concat([Buffer.from([l.length]), Buffer.from(l, 'latin1')]))
  const tail = Buffer.alloc(4)
  tail.writeUInt16BE(type, 0)
  tail.writeUInt16BE(1, 2)
  return Buffer.concat([header, ...labels, Buffer.from([0]), tail])
}

export type DnsReply = { id: number; rcode: number; authoritative: boolean; recursionAvailable: boolean; answers: string[] }

export function readReply(b: Buffer): DnsReply {
  const flags = b.readUInt16BE(2)
  const count = b.readUInt16BE(6)
  let at = 12
  if (b.readUInt16BE(4) === 1) {
    while (b[at] !== 0) at += b[at]! + 1
    at += 5
  }
  const answers: string[] = []
  for (let i = 0; i < count; i++) {
    const len = b.readUInt16BE(at + 10)
    answers.push([...b.subarray(at + 12, at + 12 + len)].join('.'))
    at += 12 + len
  }
  return { id: b.readUInt16BE(0), rcode: flags & 0xf, authoritative: !!(flags & 0x0400), recursionAvailable: !!(flags & 0x0080), answers }
}
