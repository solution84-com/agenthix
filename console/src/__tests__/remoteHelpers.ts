/**
 * For the remote access tests: a certificate for a key, as Cloud's issuer would give one (here self-signed, written
 * with the same DER helpers as the request), a DER reader to look inside one, and an https client that talks to the
 * direct listener on 127.0.0.1 under the name it serves.
 */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import type { RemoteAccess } from '../net/remoteAccess'
import { bitString, contextTag, integer, octetString, oid, pem, sequence, set, tlv, utf8String } from '../net/der'

const utcTime = (d: Date) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z', 'ascii'))
const name = (cn: string) => sequence(set(sequence(oid('2.5.4.3'), utf8String(cn))))

/** A certificate for `keyPem`'s public key, naming `dnsName`, signed by `issuerKeyPem` (the same key by default). */
export function certificateFor(keyPem: string, dnsName: string, o: { notAfter?: Date; notBefore?: Date; issuerKeyPem?: string } = {}): string {
  const spki = createPublicKey(createPrivateKey(keyPem)).export({ type: 'spki', format: 'der' })
  const alg = sequence(oid('1.2.840.10045.4.3.2'))
  const san = sequence(oid('2.5.29.17'), octetString(sequence(contextTag(2, false, Buffer.from(dnsName, 'ascii')))))
  const tbs = sequence(
    contextTag(0, true, integer(2)), integer(7), alg, name('Test issuer'),
    sequence(utcTime(o.notBefore ?? new Date(Date.now() - 3600_000)), utcTime(o.notAfter ?? new Date(Date.now() + 24 * 3600_000))),
    name(dnsName), spki, contextTag(3, true, sequence(san)),
  )
  const signature = sign('sha256', tbs, { key: createPrivateKey(o.issuerKeyPem ?? keyPem), dsaEncoding: 'der' })
  return pem('CERTIFICATE', sequence(tbs, alg, bitString(signature)))
}

export type Der = { tag: number; content: Buffer; whole: Buffer }

/** The TLV items one after another in `b`. */
export function readDer(b: Buffer): Der[] {
  const out: Der[] = []
  let i = 0
  while (i < b.length) {
    const tag = b[i]!
    let len = b[i + 1]!
    let head = 2
    if (len & 0x80) {
      const n = len & 0x7f
      len = 0
      for (let k = 0; k < n; k++) len = len * 256 + b[i + 2 + k]!
      head = 2 + n
    }
    out.push({ tag, content: b.subarray(i + head, i + head + len), whole: b.subarray(i, i + head + len) })
    i += head + len
  }
  return out
}

export const fromPem = (text: string) => Buffer.from(text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')

export type RemoteAnswer = { status: number; json: Record<string, unknown>; setCookie: string | null; certificate: tls.PeerCertificate }

/** A request to the direct listener at 127.0.0.1:`port`, presenting `host` as SNI and Host header. */
export function remoteRequest(port: number, path: string, init: {
  method?: string; body?: unknown; host?: string; headers?: Record<string, string>; cookie?: string; csrf?: string
} = {}): Promise<RemoteAnswer> {
  const host = init.host ?? 'fc-1.console.example'
  const headers: Record<string, string> = { host, ...(init.headers ?? {}) }
  const body = init.body === undefined ? undefined : JSON.stringify(init.body)
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(Buffer.byteLength(body))
  }
  if (init.cookie) headers.cookie = init.cookie
  if (init.csrf) headers['x-csrf-token'] = init.csrf
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers, servername: net.isIP(host.split(':')[0]!) ? undefined : host.split(':')[0],
      rejectUnauthorized: false, agent: false,
    }, res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0, json: text ? JSON.parse(text) : {}, setCookie: res.headers['set-cookie']?.[0] ?? null,
        certificate: (res.socket as tls.TLSSocket).getPeerCertificate(),
      }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

export const NAME = 'fc-1.console.example'
export const inHours = (h: number, from = Date.now()) => new Date(from + h * 3600_000).toISOString()

export async function freePort(): Promise<number> {
  const s = net.createServer()
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
  const port = (s.address() as net.AddressInfo).port
  await new Promise<void>(r => s.close(() => r()))
  return port
}

/** Asks for a request, has a certificate made for the new key, and turns remote access on with it. */
export async function turnOn(ra: RemoteAccess, state: { readText: (...p: string[]) => string | null }, over: Record<string, unknown> = {}) {
  ra.csr(NAME)
  const key = state.readText('remote-access', 'key.next.pem')!
  const port = await freePort()
  const certificate = certificateFor(key, NAME)
  const answer = await ra.on({ name: NAME, port, certificate, until: inHours(2), allow: ['127.0.0.1/32'], ...over })
  return { port, key, certificate, answer }
}

