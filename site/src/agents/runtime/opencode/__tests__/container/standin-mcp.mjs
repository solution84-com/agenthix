// A stand-in for the site's platform-tool server (MCP over HTTP, JSON answers), for the container
// checks. Any bearer token is accepted and logged, so a check can see which conversation's token
// each call carried. Tools: stamp(note), whoami().
import http from 'node:http'
import fs from 'node:fs'

const PORT = Number(process.env.PORT || 9200)
const LOG = process.env.LOG || '/standin-logs/mcp.jsonl'
const tools = [
  { name: 'stamp', description: 'Record a note on the platform. Returns a receipt.', inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } },
  { name: 'whoami', description: 'Say which token called.', inputSchema: { type: 'object', properties: {} } },
]

http.createServer((req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) { res.writeHead(401); return res.end() }
  if (req.method === 'GET') { res.writeHead(405); return res.end() }
  if (req.method === 'DELETE') { res.writeHead(200); return res.end() }
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    let msg
    try { msg = JSON.parse(raw) } catch { res.writeHead(400); return res.end() }
    const reply = r => { res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's1' }); res.end(JSON.stringify(r)) }
    if (Array.isArray(msg) || msg.id === undefined) { res.writeHead(202); return res.end() }
    if (msg.method === 'initialize') {
      return reply({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'standin', version: '0.0.1' } } })
    }
    if (msg.method === 'tools/list') return reply({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    if (msg.method === 'tools/call') {
      fs.appendFileSync(LOG, JSON.stringify({ token, call: msg.params?.name, args: msg.params?.arguments }) + '\n')
      const text = msg.params?.name === 'whoami' ? `token ${token.slice(0, 6)}` : `receipt:${msg.params?.arguments?.note}`
      return reply({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }] } })
    }
    if (msg.method === 'ping') return reply({ jsonrpc: '2.0', id: msg.id, result: {} })
    return reply({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } })
  })
}).listen(PORT, '127.0.0.1')
