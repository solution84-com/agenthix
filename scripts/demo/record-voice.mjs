// node scripts/demo/record-voice.mjs [--dry-run] [--only <agent>] [--voice <name>] [--model <id>]
//
// Records the demo's spoken lines once, with Inworld's text to speech, in the voice the sample organisation's seed
// gives its agents: each intent's reply that a voice line names, each agent's first voice line, its fallback, and its
// own closing lines (`spoken`: work came back, done, refused, waiting).
// Writes `demo/voice/<agent>-<intent>.mp3` (`-first-line`, `-fallback`, `-work-came-back`, `-done`, `-refused`,
// `-waiting`) and sets `voiceClip` on that line in
// `demo/agents/<agent>.json`. Run it again when a line changes. The key is read from INWORLD_API_KEY.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_ROOT = path.resolve(HERE, '../../demo')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** The voice and model the seed gives the organisation's agents: an agent's own `voice` first, else the default. */
export function seededVoices(root) {
  const seed = path.join(root, 'seed')
  const readOr = (name) => (fs.existsSync(path.join(seed, name)) ? readJson(path.join(seed, name)) : {})
  const tts = readOr('library.json').defaults?.tts ?? {}
  const own = {}
  for (const agent of readOr('organisation.json').agents ?? []) if (agent.voice) own[agent.handle] = agent.voice
  return { voice: tts.voice ?? null, model: tts.model ?? null, own }
}

/** Every line a lead script speaks, with where its clip name is written back into the script. */
export function spokenLines(script) {
  const agent = script.agent
  const lines = []
  const named = new Set(script.voiceLines.map(l => l.intent))
  for (const intent of script.intents) {
    if (named.has(intent.id)) lines.push({ agent, key: intent.id, text: intent.reply, target: intent })
  }
  lines.push({ agent, key: 'first-line', text: script.firstVoiceLine.text, target: script.firstVoiceLine })
  lines.push({ agent, key: 'fallback', text: script.fallback.reply, target: script.fallback })
  for (const [name, line] of Object.entries(script.spoken ?? {})) {
    lines.push({ agent, key: name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), text: line.text, target: line })
  }
  return lines.map(l => ({ ...l, clip: `${agent}-${l.key}.mp3` }))
}

/**
 * The words sent to text to speech: a line as written, with names respelled so the voice says them right. The voice
 * says "Agenthix" with a hard g, so it is sent as "Agentics", the closest spelling to how it is said; the line shown
 * keeps the name as written.
 */
export function spokenText(text) {
  return text.replace(/agenthix/gi, word => (word === word.toUpperCase() ? 'AGENTICS' : word[0] === 'A' ? 'Agentics' : 'agentics'))
}

export async function synthesise({ fetch, apiKey, text, voice, model }) {
  const res = await fetch(INWORLD_TTS_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voice, model_id: model, audio_config: { audio_encoding: 'MP3' } }),
  })
  if (!res.ok) throw new Error(`Inworld text to speech answered ${res.status}`)
  const { audioContent } = await res.json()
  if (typeof audioContent !== 'string' || !audioContent) throw new Error('Inworld text to speech sent no audio')
  return Buffer.from(audioContent, 'base64')
}

export async function record({ root = DEFAULT_ROOT, apiKey, fetch = globalThis.fetch, dryRun = false, only, voice, model, log = console.log }) {
  const seeded = seededVoices(root)
  const files = fs.readdirSync(path.join(root, 'agents')).filter(f => f.endsWith('.json')).sort()
  const planned = []
  for (const file of files) {
    const script = readJson(path.join(root, 'agents', file))
    if (only && script.agent !== only) continue
    const agentVoice = voice ?? seeded.own[script.agent] ?? seeded.voice
    const agentModel = model ?? seeded.model
    if (!agentVoice || !agentModel) throw new Error(`No voice or model for ${script.agent}: the seed sets none; pass --voice and --model`)
    planned.push({ file, script, voice: agentVoice, model: agentModel, lines: spokenLines(script) })
  }
  for (const p of planned) for (const l of p.lines) log(`${dryRun ? 'would record' : 'recording'} ${l.clip} (${p.voice}): ${l.text}`)
  if (dryRun) return planned.flatMap(p => p.lines.map(l => l.clip))
  if (!apiKey) throw new Error('INWORLD_API_KEY is not set')
  fs.mkdirSync(path.join(root, 'voice'), { recursive: true })
  const written = []
  for (const p of planned) {
    try {
      for (const l of p.lines) {
        const audio = await synthesise({ fetch, apiKey, text: spokenText(l.text), voice: p.voice, model: p.model })
        fs.writeFileSync(path.join(root, 'voice', l.clip), audio)
        l.target.voiceClip = l.clip
        written.push(l.clip)
      }
    } finally {
      // What was recorded stays named, so a failed run can be run again from the script's own state.
      fs.writeFileSync(path.join(root, 'agents', p.file), `${JSON.stringify(p.script, null, 2)}\n`)
    }
  }
  return written
}

function parse(argv) {
  const out = { dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--only') out.only = argv[++i]
    else if (a === '--voice') out.voice = argv[++i]
    else if (a === '--model') out.model = argv[++i]
    else throw new Error(`Unknown option ${a}`)
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  record({ ...parse(process.argv.slice(2)), apiKey: process.env.INWORLD_API_KEY }).then(
    (clips) => console.log(`${clips.length} clip${clips.length === 1 ? '' : 's'} ${process.argv.includes('--dry-run') ? 'planned' : 'recorded'}`),
    (err) => { console.error(err.message); process.exit(1) },
  )
}
