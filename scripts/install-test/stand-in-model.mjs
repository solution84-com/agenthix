// A stand-in for a model provider, so the install test sends a message without calling a real model: an
// OpenAI-compatible endpoint, added in HQ as "Own endpoint", that answers every chat with the same few words.
//   node scripts/install-test/stand-in-model.mjs <port> <log file>
// It listens on every address, since HQ's server reaches it from its container at the machine's network address,
// and writes one line per request to the log, which run.sh reads to say how many replies it gave.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPLY = 'The stand-in model answers.'
const MODEL = 'stand-in'

const completion = (id) => ({
  id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: MODEL,
  choices: [{ index: 0, message: { role: 'assistant', content: REPLY }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 5, total_tokens: 6 },
})

const chunk = (id, delta, finish = null) => ({
  id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: MODEL,
  choices: [{ index: 0, delta, finish_reason: finish }],
})

function chat(res, body) {
  const id = `chatcmpl-${Date.now()}`
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(completion(id)))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const send = (data) => res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  send(chunk(id, { role: 'assistant', content: '' }))
  for (const word of REPLY.split(/(?<= )/)) send(chunk(id, { content: word }))
  send(chunk(id, {}, 'stop'))
  if (body.stream_options?.include_usage) send({ ...chunk(id, {}), choices: [], usage: completion(id).usage })
  send('[DONE]')
  res.end()
}

export function standInModel(log = () => {}) {
  return http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0].replace(/^\/v1/, '')
      log(`${req.method} ${path}`)
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* answered below as not found */ }
      if (req.method === 'GET' && path === '/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ object: 'list', data: [{ id: MODEL, object: 'model', owned_by: 'install-test' }] }))
      } else if (req.method === 'POST' && path === '/chat/completions') {
        chat(res, body)
      } else {
        res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'The stand-in answers chats only.' } }))
      }
    })
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [port, file] = process.argv.slice(2)
  if (!port || !file) {
    console.error('Usage: node stand-in-model.mjs <port> <log file>')
    process.exit(2)
  }
  standInModel((line) => fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`))
    .listen(Number(port), '0.0.0.0', () => console.log(`The stand-in model answers on port ${port}.`))
}
