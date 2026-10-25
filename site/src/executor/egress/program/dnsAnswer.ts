/**
 * The proxy's DNS answers (workflows spec part 2, *The containers* D). Docker's resolver forwards every name a step
 * looks up to the proxy, in full, and to nothing else, so the proxy is the step's only way to resolve a name and
 * never asks anyone: an approved name gets the proxy's own address, and every other name `NXDOMAIN`. An upstream
 * query would carry the name's labels, and anything encoded in them, off the machine.
 *
 * Part of the proxy's program, which runs in its own container from this function's source text: it may use only
 * its arguments and Node's globals, never anything imported into this module.
 */
export function answerDnsQuery(query: Uint8Array, names: readonly string[], address: string): Buffer | null {
  const TTL_SECONDS = 60
  const RCODE = { ok: 0, formatError: 1, noName: 3, notImplemented: 4 }
  if (query.length < 12) return null
  const b = Buffer.from(query.buffer, query.byteOffset, query.length)
  const id = b.readUInt16BE(0)
  const flags = b.readUInt16BE(2)
  if (flags & 0x8000) return null
  const opcode = (flags >> 11) & 0xf
  const header = (rcode: number, questions: number, answers: number): Buffer => {
    const h = Buffer.alloc(12)
    h.writeUInt16BE(id, 0)
    // A response, authoritative, the query's opcode and RD bit, no recursion available.
    h.writeUInt16BE(0x8000 | (opcode << 11) | 0x0400 | (flags & 0x0100) | rcode, 2)
    h.writeUInt16BE(questions, 4)
    h.writeUInt16BE(answers, 6)
    return h
  }
  if (opcode !== 0) return header(RCODE.notImplemented, 0, 0)
  if (b.readUInt16BE(4) !== 1) return header(RCODE.formatError, 0, 0)

  const labels: string[] = []
  let at = 12
  let length = 0
  for (;;) {
    if (at >= b.length) return header(RCODE.formatError, 0, 0)
    const len = b[at]!
    if (len === 0) { at++; break }
    // Over 63 is a compression pointer or garbage: a query's one name is never compressed.
    if (len > 63 || at + 1 + len > b.length) return header(RCODE.formatError, 0, 0)
    labels.push(b.toString('latin1', at + 1, at + 1 + len))
    length += len + 1
    if (length > 255) return header(RCODE.formatError, 0, 0)
    at += 1 + len
  }
  if (at + 4 > b.length) return header(RCODE.formatError, 0, 0)
  const type = b.readUInt16BE(at)
  const klass = b.readUInt16BE(at + 2)
  const question = b.subarray(12, at + 4)

  const name = labels.join('.').toLowerCase()
  const approved = labels.every(l => /^[A-Za-z0-9_-]+$/.test(l)) && names.includes(name)
  if (!approved) return Buffer.concat([header(RCODE.noName, 1, 0), question])
  // An approved name has an A record and nothing else: AAAA and every other type are answered empty.
  if (type !== 1 || klass !== 1) return Buffer.concat([header(RCODE.ok, 1, 0), question])
  const record = Buffer.alloc(16)
  record.writeUInt16BE(0xc00c, 0)
  record.writeUInt16BE(1, 2)
  record.writeUInt16BE(1, 4)
  record.writeUInt32BE(TTL_SECONDS, 6)
  record.writeUInt16BE(4, 10)
  address.split('.').forEach((octet, i) => { record[12 + i] = Number(octet) })
  return Buffer.concat([header(RCODE.ok, 1, 1), question, record])
}
