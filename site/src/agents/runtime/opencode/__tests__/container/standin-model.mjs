// A stand-in for an OpenAI-compatible model endpoint, for the container checks.
// It calls no model. It runs on the test's own machine, reached only through
// the site's model relay, and prints the port it listens on (PORT, 0 for any). The last user message scripts it:
//   DIRECTIVE:STEPS [[call, call], [call], ...]  each inner list is one step of parallel tool calls, then "DONE"
//   anything else                                 "OK"
// Every request is logged, one JSON line each: its Authorization header, the
// tools offered, how many messages it carried, the last user message's text, and the last tool results.
import http from 'node:http'
import fs from 'node:fs'

const PORT = Number(process.env.PORT || 9100)
const LOG = process.env.LOG || '/standin-logs/model.jsonl'
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

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    const n = ++seq
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch {}
    const rec = {
      n,
      url: req.url,
      authorization: req.headers.authorization ?? null,
      tools: (body.tools || []).map(t => t.function?.name).sort(),
      messages: (body.messages || []).length,
      lastUser: textOf([...(body.messages || [])].reverse().find(x => x.role === 'user')?.content),
      toolResults: (body.messages || []).filter(x => x.role === 'tool').map(x => textOf(x.content)),
      system: (body.messages || []).filter(x => x.role === 'system').map(x => textOf(x.content)).join('\n'),
    }
    fs.appendFileSync(LOG, JSON.stringify(rec) + '\n')
    if (!req.url.includes('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'm1', object: 'model' }] }))
      return
    }
    const p = plan(body)
    const base = { id: `chatcmpl-${n}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model }
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
})
server.listen(PORT, '127.0.0.1', () => console.log(server.address().port))
