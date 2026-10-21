// The site's address inside a container that has no network, for the container
// checks: it listens on the container's loopback address and carries each
// request and its answer as they stream, in frames of one JSON line each, over
// its standard output and input to the test process, which serves them with
// the site's own handlers. It never answers on its own, so without the test
// process every request goes unanswered.
//
// Out (container to test): {id, t:'req', method, url, headers}, {id, t:'data', b64},
//   {id, t:'end'}, and {id, t:'abort'} when the client goes before its answer ends.
// In (test to container):  {id, t:'res', status, headers}, {id, t:'data', b64},
//   {id, t:'end'}, and {id, t:'error'} when the answer broke off.
import http from 'node:http'
import readline from 'node:readline'

const PORT = Number(process.env.PORT || 9300)
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'])
const pending = new Map()
let seq = 0

const send = frame => process.stdout.write(JSON.stringify(frame) + '\n')

readline.createInterface({ input: process.stdin }).on('line', line => {
  let frame
  try { frame = JSON.parse(line) } catch { return }
  const res = pending.get(frame.id)
  if (!res) return
  if (frame.t === 'res') {
    const headers = Object.fromEntries(Object.entries(frame.headers).filter(([k]) => !HOP_BY_HOP.has(k)))
    res.writeHead(frame.status, headers)
    res.flushHeaders()
  } else if (frame.t === 'data') {
    res.write(Buffer.from(frame.b64, 'base64'))
  } else if (frame.t === 'end') {
    pending.delete(frame.id)
    res.end()
  } else if (frame.t === 'error') {
    pending.delete(frame.id)
    res.destroy()
  }
})

http.createServer((req, res) => {
  const id = ++seq
  pending.set(id, res)
  send({ id, t: 'req', method: req.method, url: req.url, headers: req.headers })
  req.on('data', chunk => send({ id, t: 'data', b64: chunk.toString('base64') }))
  req.on('end', () => send({ id, t: 'end' }))
  res.on('close', () => {
    if (pending.delete(id)) send({ id, t: 'abort' })
  })
}).listen(PORT, '127.0.0.1')
