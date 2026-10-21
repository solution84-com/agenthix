// A stand-in for the Anthropic Messages API, for the Claude container test.
// Never a real model. Runs on the test's own machine, reached only through the
// site's model relay, prints the port it listens on (PORT, 0 for any), and
// logs every request (model, key, tool names) to $LOG, and each whole request
// body to $BODY_LOG when it is set. The latest user text chooses the
// reply:
//   DO:BASH <command>   one Bash call, then text
//   DO:READ <path>      one Read call, then text
//   DO:GREP <pattern> <path>   one Grep call (matching lines), then text
//   DO:GLOB <pattern> <path>   one Glob call, then text
//   DO:BIGREAD          a Bash call with a large output, then a Read of the
//                       file Claude Code saved it to, then text
//   DO:SKILL <name>     one Skill call loading that skill, then text
//   DO:SLOW             text trickled for 20 s
//   anything else       text
import http from 'node:http'
import fs from 'node:fs'

const LOG = process.env.LOG ?? '/fixtures/anthropic.jsonl'
let n = 0
const textOf = c => typeof c === 'string' ? c : (c ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n')
const resultsOf = m => Array.isArray(m?.content) ? m.content.filter(b => b.type === 'tool_result') : []

function plan(msgs) {
  let userText = ''
  let at = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = msgs[i].role === 'user' ? textOf(msgs[i].content) : ''
    if (/DO:|TURN/.test(t)) { userText = t; at = i; break }
  }
  const rounds = msgs.slice(at + 1).filter(m => m.role === 'assistant').length
  const last = resultsOf(msgs[msgs.length - 1])[0]
  const lastText = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
  const bash = userText.match(/DO:BASH (.*)$/s)
  if (bash && rounds === 0) return { tool: 'Bash', input: { command: bash[1].trim(), description: 'stand-in' } }
  const read = userText.match(/DO:READ (\S+)/)
  if (read && rounds === 0) return { tool: 'Read', input: { file_path: read[1] } }
  const grep = userText.match(/DO:GREP (\S+) (\S+)/)
  if (grep && rounds === 0) return { tool: 'Grep', input: { pattern: grep[1], path: grep[2], output_mode: 'content' } }
  const glob = userText.match(/DO:GLOB (\S+) (\S+)/)
  if (glob && rounds === 0) return { tool: 'Glob', input: { pattern: glob[1], path: glob[2] } }
  const skill = userText.match(/DO:SKILL (\S+)/)
  if (skill && rounds === 0) return { tool: 'Skill', input: { skill: skill[1] } }
  if (userText.includes('DO:BIGREAD')) {
    if (rounds === 0) return { tool: 'Bash', input: { command: 'head -c 300000 /dev/zero | tr "\\0" a | fold -w 100', description: 'big' } }
    const saved = lastText.match(/saved to: (\S+\.txt)/)
    if (rounds === 1 && saved) return { tool: 'Read', input: { file_path: saved[1], limit: 2 } }
  }
  if (userText.includes('DO:SLOW') && rounds === 0) return { slow: true }
  return { text: `stand-in reply ${rounds}` }
}

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', async () => {
    const id = ++n
    if (req.method !== 'POST') { res.writeHead(404).end(); return }
    if (req.url.includes('count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":1}'); return }
    let j = {}
    try { j = JSON.parse(raw) } catch {}
    const p = plan(j.messages ?? [])
    fs.appendFileSync(LOG, JSON.stringify({ id, model: j.model, xApiKey: req.headers['x-api-key'] ?? null, plan: p.tool ?? (p.slow ? 'slow' : 'text'), tools: (j.tools ?? []).map(t => t.name) }) + '\n')
    if (process.env.BODY_LOG) fs.appendFileSync(process.env.BODY_LOG, JSON.stringify({ id, body: j }) + '\n')
    const model = j.model ?? 'm'
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    ev('message_start', { message: { id: `msg_${id}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage } })
    let stop = 'end_turn'
    if (p.tool) {
      ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: `toolu_${id}`, name: p.tool, input: {} } })
      ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(p.input) } })
      stop = 'tool_use'
    } else {
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      if (p.slow) {
        let closed = false
        res.on('close', () => { closed = true })
        for (let i = 0; i < 80 && !closed; i++) { ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '.' } }); await new Promise(r => setTimeout(r, 250)) }
        if (closed) return
      } else ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: p.text } })
    }
    ev('content_block_stop', { index: 0 })
    ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } })
    ev('message_stop', {})
    res.end()
  })
})
server.listen(Number(process.env.PORT ?? 9300), '127.0.0.1', () => console.log(server.address().port))
