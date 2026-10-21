// node --test scripts/install-test/__tests__/stand-in-model.test.mjs
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { REPLY, standInModel } from '../stand-in-model.mjs'

const seen = []
const server = standInModel((line) => seen.push(line))
let base = ''

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/v1`
})
after(() => server.close())

const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('a streamed chat is answered word by word, then stopped, then done @SC-1149', async () => {
  const text = await (await post('/chat/completions', { model: 'stand-in', stream: true, stream_options: { include_usage: true } })).text()
  const events = text.split('\n\n').filter(Boolean).map((e) => e.replace(/^data: /, ''))
  assert.equal(events.at(-1), '[DONE]')
  const chunks = events.slice(0, -1).map((e) => JSON.parse(e))
  assert.equal(chunks.map((c) => c.choices[0]?.delta.content ?? '').join(''), REPLY)
  assert.ok(chunks.some((c) => c.choices[0]?.finish_reason === 'stop'))
  assert.ok(chunks.at(-1).usage)
})

test('a chat that is not streamed is answered whole @SC-1149', async () => {
  const body = await (await post('/chat/completions', { model: 'stand-in' })).json()
  assert.equal(body.choices[0].message.content, REPLY)
})

test('it answers chats and its model list only, and logs each request @SC-1149', async () => {
  assert.equal((await post('/embeddings', { input: 'x' })).status, 404)
  assert.equal((await (await fetch(`${base}/models`)).json()).data[0].id, 'stand-in')
  assert.ok(seen.includes('POST /chat/completions'))
  assert.ok(seen.includes('POST /embeddings'))
})
