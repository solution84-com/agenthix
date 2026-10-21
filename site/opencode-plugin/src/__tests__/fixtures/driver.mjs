// The test's hands inside the container: talks to the OpenCode server and the
// stand-in site on loopback, and prints one JSON answer.
//   node driver.mjs ready
//   node driver.mjs session '{"conversationId":"conv-a","headers":{...}}'
//   node driver.mjs turn '{"sessionId":"…","steps":[[…]],"system":"…","model":{…},"full":true}'
// A turn's tool outputs are cut to 4,000 characters unless `full` is set.
//   node driver.mjs noturn|hang '{"sessionId":"…"}'
const BASE = 'http://127.0.0.1:4096'
const SITE = 'http://127.0.0.1:9400'
const DIR = '/projects/p1/files'
const AUTH = 'Basic ' + Buffer.from('opencode:' + process.env.OPENCODE_SERVER_PASSWORD).toString('base64')
const q = p => p + (p.includes('?') ? '&' : '?') + 'directory=' + encodeURIComponent(DIR)

async function api(method, p, body, timeoutMs = 60000) {
  const r = await fetch(BASE + q(p), {
    method, headers: { authorization: AUTH, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json }
}
const control = (p, body) => fetch(SITE + p, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })

const ops = {
  async ready() {
    const end = Date.now() + 90000
    while (Date.now() < end) {
      try { if ((await api('GET', '/session', undefined, 2000)).status === 200) return { ready: true } } catch {}
      await new Promise(r => setTimeout(r, 250))
    }
    return { ready: false }
  },
  async session({ conversationId, headers }) {
    const s = (await api('POST', '/session', { title: conversationId, permission: [{ permission: 'skill', pattern: '*', action: 'allow' }] })).json
    await control('/control/turn', { sessionId: s.id, turn: { conversationId, conversationToken: `tok-${conversationId}`, modelHeaders: headers } })
    return { sessionId: s.id }
  },
  async noturn({ sessionId }) { await control('/control/turn', { sessionId, turn: null }); return {} },
  async hang({ sessionId }) { await control('/control/hang', { sessionId }); return {} },
  async turn({ sessionId, steps, system, model, full = false, timeoutMs = 240000 }) {
    const before = new Set(((await api('GET', `/session/${sessionId}/message`)).json ?? []).map(m => m.info.id))
    const r = await api('POST', `/session/${sessionId}/message`, {
      parts: [{ type: 'text', text: 'DIRECTIVE:STEPS ' + JSON.stringify(steps ?? []) }],
      ...(system ? { system } : {}), ...(model ? { model } : {}),
    }, timeoutMs)
    const msgs = ((await api('GET', `/session/${sessionId}/message`)).json ?? []).filter(m => !before.has(m.info.id))
    const tools = []
    for (const m of msgs) for (const p of m.parts ?? []) if (p.type === 'tool') {
      const output = full ? p.state?.output : p.state?.output?.slice?.(0, 4000)
      const attachments = (p.state?.attachments ?? []).map(a => ({ mime: a.mime, url: a.url }))
      tools.push({ tool: p.tool, status: p.state?.status, input: p.state?.input, output, error: p.state?.error, ...(full ? { attachments } : {}) })
    }
    const errors = msgs.map(m => m.info.error).filter(Boolean)
    const final = r.json?.parts?.filter?.(p => p.type === 'text').map(p => p.text).join('') ?? null
    return { status: r.status, final, errors, tools }
  },
}

const [op, arg] = process.argv.slice(2)
const out = await ops[op](arg ? JSON.parse(arg) : {})
// Exit only once the answer is written: a pipe takes it in 64 KB pieces.
process.stdout.write(JSON.stringify(out), () => process.exit(0))
