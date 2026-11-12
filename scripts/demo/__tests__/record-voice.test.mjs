// node --test scripts/demo/__tests__/record-voice.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { INWORLD_TTS_URL, record, seededVoices, spokenLines, spokenText } from '../record-voice.mjs'

function makeRoot({ seed = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'record-voice-'))
  fs.mkdirSync(path.join(root, 'agents'))
  const script = (agent) => ({
    format: 1, agent,
    intents: [
      { id: 'hello', phrasings: ['hi'], reply: `${agent} says hello.` },
      { id: 'quiet', phrasings: ['shh'], reply: 'Not spoken: no voice line names it.' },
    ],
    fallback: { reply: 'Only scripted answers.' },
    spoken: { workCameBack: { text: 'Back.' }, done: { text: 'Done.' }, refused: { text: 'Refused.' }, waiting: { text: 'Waiting.' } },
    suggestedPrompts: [],
    voiceLines: [{ text: 'Say hello', intent: 'hello' }],
    firstVoiceLine: { text: 'This is a demo voice.' },
  })
  for (const a of ['writer', 'reviewer']) fs.writeFileSync(path.join(root, 'agents', `${a}.json`), JSON.stringify(script(a), null, 2))
  if (seed) {
    fs.mkdirSync(path.join(root, 'seed'))
    fs.writeFileSync(path.join(root, 'seed', 'library.json'), JSON.stringify({ defaults: { tts: { provider: 'tts', model: 'tts-model', voice: 'Clive' } } }))
    fs.writeFileSync(path.join(root, 'seed', 'organisation.json'), JSON.stringify({ agents: [{ handle: 'reviewer', voice: 'Ashley' }, { handle: 'writer' }] }))
  }
  return root
}

const fakeFetch = (calls, status = 200) => async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) })
  return { ok: status === 200, status, json: async () => ({ audioContent: Buffer.from(`audio:${calls.length}`).toString('base64') }) }
}

test('a spoken line is each intent a voice line names, the first voice line, the fallback and the closing lines @SC-2001', () => {
  const root = makeRoot()
  const lines = spokenLines(JSON.parse(fs.readFileSync(path.join(root, 'agents', 'writer.json'), 'utf8')))
  assert.deepEqual(lines.map(l => l.clip), [
    'writer-hello.mp3', 'writer-first-line.mp3', 'writer-fallback.mp3',
    'writer-work-came-back.mp3', 'writer-done.mp3', 'writer-refused.mp3', 'writer-waiting.mp3',
  ])
  assert.deepEqual(lines.map(l => l.text), ['writer says hello.', 'This is a demo voice.', 'Only scripted answers.', 'Back.', 'Done.', 'Refused.', 'Waiting.'])
})

test('the seed gives the voice: an agent’s own, else the organisation’s default @SC-2001', () => {
  assert.deepEqual(seededVoices(makeRoot()), { voice: 'Clive', model: 'tts-model', own: { reviewer: 'Ashley' } })
})

test('--dry-run lists what it would record and calls nothing, with no key @SC-2001', async () => {
  const root = makeRoot()
  const calls = []
  const logged = []
  const clips = await record({ root, dryRun: true, fetch: fakeFetch(calls), log: m => logged.push(m) })
  assert.equal(calls.length, 0)
  assert.equal(clips.length, 14)
  assert.ok(logged.some(m => m.includes('reviewer-hello.mp3 (Ashley)')))
  assert.ok(logged.some(m => m.includes('writer-hello.mp3 (Clive)')))
  assert.equal(fs.existsSync(path.join(root, 'voice')), false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'agents', 'writer.json'), 'utf8')).intents[0].voiceClip, undefined)
})

test('records each line in the agent’s voice, writes the clip and names it in the script @SC-2001', async () => {
  const root = makeRoot()
  const calls = []
  const written = await record({ root, apiKey: 'KEY', fetch: fakeFetch(calls), log: () => {} })
  assert.equal(written.length, 14)
  assert.ok(calls.every(c => c.url === INWORLD_TTS_URL && c.init.headers.Authorization === 'Basic KEY'))
  assert.deepEqual(calls[0].body, { text: 'reviewer says hello.', voice_id: 'Ashley', model_id: 'tts-model', audio_config: { audio_encoding: 'MP3' } })
  assert.equal(calls.find(c => c.body.text === 'writer says hello.').body.voice_id, 'Clive')
  assert.equal(fs.readFileSync(path.join(root, 'voice', 'reviewer-hello.mp3'), 'utf8'), 'audio:1')
  const writer = JSON.parse(fs.readFileSync(path.join(root, 'agents', 'writer.json'), 'utf8'))
  assert.equal(writer.intents[0].voiceClip, 'writer-hello.mp3')
  assert.equal(writer.intents[1].voiceClip, undefined)
  assert.equal(writer.firstVoiceLine.voiceClip, 'writer-first-line.mp3')
  assert.equal(writer.fallback.voiceClip, 'writer-fallback.mp3')
  assert.equal(writer.spoken.done.voiceClip, 'writer-done.mp3')
})

test('--only records one agent @SC-2001', async () => {
  const root = makeRoot()
  const calls = []
  await record({ root, apiKey: 'KEY', only: 'writer', fetch: fakeFetch(calls), log: () => {} })
  assert.equal(calls.length, 7)
  assert.equal(fs.existsSync(path.join(root, 'voice', 'reviewer-hello.mp3')), false)
})

test('without a key it records nothing @SC-2001', async () => {
  const root = makeRoot()
  const calls = []
  await assert.rejects(record({ root, fetch: fakeFetch(calls), log: () => {} }), /INWORLD_API_KEY/)
  assert.equal(calls.length, 0)
})

test('a refused call stops, and says the status without the key @SC-2001', async () => {
  const root = makeRoot()
  await assert.rejects(record({ root, apiKey: 'SECRET', fetch: fakeFetch([], 401), log: () => {} }), err => /401/.test(err.message) && !/SECRET/.test(err.message))
})

test('a seed with no voice needs --voice and --model @SC-2001', async () => {
  const root = makeRoot({ seed: false })
  await assert.rejects(record({ root, dryRun: true, log: () => {} }), /--voice/)
  const clips = await record({ root, dryRun: true, voice: 'V', model: 'M', log: () => {} })
  assert.equal(clips.length, 14)
})

test('sends Agenthix to text to speech as Agentics, so the voice says it right, and leaves other words as written @SC-2001', () => {
  assert.equal(spokenText('I explain how Agenthix works; agenthix.com.'), 'I explain how Agentics works; agentics.com.')
  assert.equal(spokenText('Plain words.'), 'Plain words.')
})
