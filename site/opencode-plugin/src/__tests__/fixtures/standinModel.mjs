// A stand-in model server, inside the test container: OpenAI-compatible chat
// completions, scripted by the last user message ("DIRECTIVE:STEPS [[call, …], …]",
// one inner array per model step), then "DONE". Every request is logged with the
// headers that carry a key and the system prompt it held. Any other API (a
// provider's own format) is logged and answered 400, so no retry follows.
import fs from 'node:fs'
import http from 'node:http'

const LOG = '/f/logs/model.jsonl'
let seq = 0
const textOf = c => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text ?? '').join('') : '')

function plan(body) {
  const msgs = body.messages || []
  let lastUser = -1
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') { lastUser = i; break }
  const userText = lastUser >= 0 ? textOf(msgs[lastUser].content) : ''
  const rounds = msgs.slice(lastUser + 1).filter(m => m.role === 'assistant').length
  const results = msgs.slice(lastUser + 1).filter(m => m.role === 'tool').length
  const m = userText.match(/DIRECTIVE:STEPS (\[.*\])/s)
  if (m) {
    const steps = JSON.parse(m[1])
    if (rounds < steps.length) return { calls: steps[rounds] }
    return { text: `DONE after ${results} tool results` }
  }
  return { text: 'OK' }
}

http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    const n = ++seq
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch {}
    const rec = {
      n, url: req.url,
      authorization: req.headers.authorization ?? null,
      xApiKey: req.headers['x-api-key'] ?? null,
      xGoogApiKey: req.headers['x-goog-api-key'] ?? null,
      system: (body.messages || []).filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n'),
      tools: (body.tools || []).map(t => ({ name: t.function?.name, description: t.function?.description })),
    }
    fs.appendFileSync(LOG, JSON.stringify(rec) + '\n')
    if (!req.url.endsWith('/chat/completions')) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'stand-in: not this API', type: 'invalid_request_error' } }))
      return
    }
    const p = plan(body)
    const base = { id: `c-${n}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const send = o => res.write(`data: ${JSON.stringify({ ...base, ...o })}\n\n`)
    send({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
    if (p.calls) {
      p.calls.forEach((c, i) => send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${n}_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }] }, finish_reason: null }] }))
      send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
    } else {
      send({ choices: [{ index: 0, delta: { content: p.text }, finish_reason: null }] })
      send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    }
    send({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
    res.write('data: [DONE]\n\n')
    res.end()
  })
}).listen(9100, '127.0.0.1')
