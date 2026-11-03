/**
 * The app forwarder's program (live preview spec section 4, *The app*): one long-lived process of the site's own per
 * live preview, run in its container by `docker exec` outside the launcher, that carries every app stream of that live
 * preview over its standard input and output. A dev server's page of hundreds of modules then costs one exec, not one
 * per request.
 *
 * Inside the container's network namespace it connects to the app's port on loopback (or, for an app bound only to
 * the container's own address, there), so an app that listens only on `localhost` works and no port is published.
 *
 * Frames, both ways: a 9-byte head (type, stream id as 32 bits, payload length as 32 bits) and the payload.
 *
 * | Type | From the site | From the forwarder |
 * |---|---|---|
 * | 1 open | the port, 16 bits | |
 * | 2 data | bytes for the app | bytes from the app |
 * | 3 end | no more bytes for the app | the app sent no more |
 * | 4 close | the stream is gone | the stream is gone (before *opened*: the app did not answer) |
 * | 5 credit | bytes taken on, 32 bits | bytes written to the app, 32 bits |
 * | 6 opened | | connected to the app |
 * | 7 hello | | the forwarder is ready (stream 0) |
 *
 * Neither side sends a stream more than `FORWARD_WINDOW` bytes beyond the credit it was given, so one slow reader holds
 * back only its own stream. It says its process id on standard error first, so the guard spares it for its life.
 */

export const FORWARD_WINDOW = 256 * 1024
export const FORWARD_MAX_FRAME = 64 * 1024
export const FORWARD_MAX_STREAMS = 1024

export const FRAME = { open: 1, data: 2, end: 3, close: 4, credit: 5, opened: 6, hello: 7 } as const

export const APP_FORWARDER_SCRIPT = `
const net = require('net'), os = require('os')
const W = ${FORWARD_WINDOW}, MAXS = ${FORWARD_MAX_STREAMS}, MAXF = ${FORWARD_MAX_FRAME}
process.stderr.write('pid ' + process.pid + '\\n')
const own = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address)
const hosts = ['127.0.0.1', ...own]
const streams = new Map()
let blocked = false
function send(t, id, p) {
  const h = Buffer.alloc(9)
  h[0] = t; h.writeUInt32BE(id, 1); h.writeUInt32BE(p ? p.length : 0, 5)
  if (!process.stdout.write(p && p.length ? Buffer.concat([h, p]) : h) && !blocked) {
    blocked = true
    for (const s of streams.values()) if (s.sock) s.sock.pause()
  }
}
process.stdout.on('drain', () => {
  blocked = false
  for (const s of streams.values()) if (s.sock && s.out < W) s.sock.resume()
})
process.stdout.on('error', () => process.exit(0))
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
function gone(id) {
  const s = streams.get(id)
  if (!s) return
  streams.delete(id)
  if (s.sock) s.sock.destroy()
  send(4, id)
}
function toApp(s, id, d) { s.sock.write(d, err => { if (!err) send(5, id, u32(d.length)) }) }
function open(id, port) {
  if (streams.has(id) || streams.size >= MAXS || !(port >= 1 && port <= 65535)) { send(4, id); return }
  const s = { sock: null, out: 0, pending: [], ended: false }
  streams.set(id, s)
  const attempt = i => {
    if (streams.get(id) !== s) return
    if (i >= hosts.length) { gone(id); return }
    const sock = net.connect(port, hosts[i])
    sock.once('error', () => attempt(i + 1))
    sock.once('connect', () => {
      if (streams.get(id) !== s) { sock.destroy(); return }
      sock.removeAllListeners('error')
      s.sock = sock
      sock.on('error', () => gone(id))
      sock.on('close', () => gone(id))
      sock.on('end', () => send(3, id))
      sock.on('data', d => {
        for (let at = 0; at < d.length; at += MAXF) send(2, id, d.subarray(at, at + MAXF))
        s.out += d.length
        if (s.out >= W || blocked) sock.pause()
      })
      send(6, id)
      for (const p of s.pending) toApp(s, id, p)
      s.pending = []
      if (s.ended) sock.end()
    })
  }
  attempt(0)
}
function onFrame(t, id, p) {
  if (t === 1) return open(id, p.length === 2 ? p.readUInt16BE(0) : 0)
  const s = streams.get(id)
  if (!s) return
  if (t === 2) { const d = Buffer.from(p); if (s.sock) toApp(s, id, d); else s.pending.push(d) }
  else if (t === 3) { if (s.sock) s.sock.end(); else s.ended = true }
  else if (t === 4) { streams.delete(id); if (s.sock) s.sock.destroy() }
  else if (t === 5 && p.length === 4) { s.out -= p.readUInt32BE(0); if (s.out < W && !blocked && s.sock) s.sock.resume() }
}
let buf = Buffer.alloc(0)
process.stdin.on('data', c => {
  buf = buf.length ? Buffer.concat([buf, c]) : c
  while (buf.length >= 9) {
    const len = buf.readUInt32BE(5)
    if (len > MAXF) process.exit(3)
    if (buf.length < 9 + len) break
    const t = buf[0], id = buf.readUInt32BE(1), p = buf.subarray(9, 9 + len)
    buf = buf.subarray(9 + len)
    onFrame(t, id, p)
  }
})
process.stdin.on('end', () => process.exit(0))
send(7, 0)
`.trim()

export const appForwarderArgv = (): string[] => ['node', '-e', APP_FORWARDER_SCRIPT]
