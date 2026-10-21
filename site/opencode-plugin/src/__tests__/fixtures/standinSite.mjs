// A stand-in for the site's two harness routes, inside the test container.
// The turn route answers each OpenCode session's current turn; the gate route
// decides each call the way the site's path rule does for file tools — on the
// real path, refusing the harness home (but the conversation's staged skills,
// to read) and /proc, and handing back the checked path — refuses any call
// whose arguments say DENY, and never answers for a session told to hang.
// apply_patch is decided on each file header, as the site's gate does
// (openCodeNames.ts). A patch naming SWAPTO:<target> outside its markers has
// /projects/p1/files/swap made a real folder before the check and swapped for
// a link to <target> straight after it: the race the plugin's tools close.
// /control/* lets the driver set turns and hangs. Every decision is logged.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const LOG = '/f/logs/site.jsonl'
const KEY = process.env.SERVER_KEY
const turns = new Map()
const hangs = new Set()
const HOME = '/home/appuser'

function realOrTail(p) {
  try { return fs.realpathSync(p) } catch { return p === '/' ? '/' : path.join(realOrTail(path.dirname(p)), path.basename(p)) }
}
const under = (p, root) => p === root || p.startsWith(root + '/')

const PATCH_HEADERS = ['*** Add File:', '*** Delete File:', '*** Update File:', '*** Move to:']
const SWAP = '/projects/p1/files/swap'

function decidePatch(args) {
  const lines = String(args.patchText).split('\n')
  for (const [i, raw] of lines.entries()) {
    const text = raw.trimStart()
    const header = PATCH_HEADERS.find(h => text.startsWith(h))
    const given = header && text.slice(header.length).trim()
    if (!given) continue
    const abs = path.resolve('/projects/p1/files', given)
    const full = realOrTail(abs)
    const real = header === '*** Delete File:' ? path.join(realOrTail(path.dirname(abs)), path.basename(abs)) : full
    if ([full, real].some(p => under(p, '/proc') || under(p, HOME))) return { decision: 'refuse', message: `Agenthix refuses apply_patch of ${full}.` }
    if (real !== abs && raw.startsWith(header)) lines[i] = `${header} ${real}`
  }
  return { decision: 'allow', args: { ...args, patchText: lines.join('\n') } }
}

function decide(turn, req) {
  const { tool, args } = req
  if (JSON.stringify(args).includes('DENY')) return { decision: 'refuse', message: `Agenthix refuses ${tool} here. Ask the person instead.` }
  if (tool === 'apply_patch' && typeof args.patchText === 'string') {
    const swapTo = args.patchText.match(/SWAPTO:(\S+)/)?.[1]
    if (!swapTo) return decidePatch(args)
    fs.rmSync(SWAP, { recursive: true, force: true })
    fs.mkdirSync(SWAP)
    fs.writeFileSync(`${SWAP}/secret.txt`, 'harmless\n')
    const d = decidePatch(args)
    fs.rmSync(`${SWAP}.l`, { force: true })
    fs.symlinkSync(swapTo, `${SWAP}.l`)
    fs.rmSync(SWAP, { recursive: true, force: true })
    fs.renameSync(`${SWAP}.l`, SWAP)
    return d
  }
  if (['read', 'write', 'edit'].includes(tool) && typeof args.filePath === 'string') {
    const real = realOrTail(path.resolve('/projects/p1/files', args.filePath))
    const skills = `${HOME}/.claude/.tmp/conversation-${turn.conversationId}/skills`
    const readable = tool === 'read' && under(real, skills)
    if (under(real, '/proc') || (under(real, HOME) && !readable)) return { decision: 'refuse', message: `Agenthix refuses ${tool} of ${real}.` }
    return { decision: 'allow', args: { ...args, filePath: real } }
  }
  return { decision: 'allow' }
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch {}
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (req.url === '/control/turn') { body.turn ? turns.set(body.sessionId, body.turn) : turns.delete(body.sessionId); return json(res, 200, {}) }
    if (req.url === '/control/hang') { hangs.add(body.sessionId); return json(res, 200, {}) }
    if (req.url === '/api/v1/harness/turn') {
      if (!KEY || bearer !== KEY) return json(res, 401, {})
      return json(res, 200, { turn: turns.get(body.sessionId) ?? null })
    }
    if (req.url === '/api/v1/harness/gate') {
      const turn = turns.get(body.sessionId)
      if (hangs.has(body.sessionId)) { fs.appendFileSync(LOG, JSON.stringify({ ...body, decision: 'hang' }) + '\n'); return }
      const d = !turn || turn.conversationToken !== bearer ? { decision: 'refuse', message: 'No turn is running.' } : decide(turn, body)
      fs.appendFileSync(LOG, JSON.stringify({ sessionId: body.sessionId, callId: body.callId, tool: body.tool, args: body.args, ...d }) + '\n')
      return json(res, 200, d)
    }
    json(res, 404, {})
  })
}).listen(9400, '127.0.0.1')
