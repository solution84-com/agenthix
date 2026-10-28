#!/usr/bin/env node
// Add the AI providers in the repository root's `.env.dev` to the development hq, through its control socket, as
// `provider add` does on an installed machine (hq/src/providers/machineCommands.ts). Run beside hq by start.sh: it
// waits for hq's socket, adds each provider whose key is set and that the organisation does not have yet, and exits.
// The keys go only inside the request on the socket, never on a command line, and are never printed.
//
// Usage: node add-providers.mjs [<env file>]   (default: <repository root>/.env.dev; nothing to do without it)
// The socket: HQ_CONTROL_SOCKET, else hq's own default for HQ_SERVER_PORT (start.sh exports it).
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ENV_FILE = process.argv[2] ?? path.join(REPO_ROOT, '.env.dev')
const WAIT_MS = 15 * 60_000
const RETRY_MS = 3_000

// Each setting of `.env.dev.example`, and the vendor it adds.
const VENDORS = [
  ['DEV_OPENROUTER_API_KEY', 'openrouter'],
  ['DEV_ANTHROPIC_API_KEY', 'anthropic'],
  ['DEV_OPENAI_API_KEY', 'openai'],
  ['DEV_GOOGLE_API_KEY', 'google'],
  ['DEV_ASSEMBLYAI_API_KEY', 'assemblyai'],
  ['DEV_INWORLD_API_KEY', 'inworld'],
]

const say = (line) => console.log(`[dev providers] ${line}`)

function readEnv(file) {
  const values = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(raw)
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

function socketPath() {
  if (process.env.HQ_CONTROL_SOCKET) return process.env.HQ_CONTROL_SOCKET
  return path.join(os.tmpdir(), `agenthix-hq-${process.env.HQ_SERVER_PORT || process.env.PORT || '3001'}`, 'control.sock')
}

function send(socket, command, args) {
  return new Promise((resolve, reject) => {
    let answer = ''
    const conn = net.createConnection(socket)
    conn.setEncoding('utf8')
    conn.setTimeout(60_000, () => conn.destroy(new Error('hq did not answer within a minute')))
    conn.on('connect', () => conn.write(`${JSON.stringify({ command, args })}\n`))
    conn.on('data', (chunk) => { answer += chunk })
    conn.on('error', reject)
    conn.on('end', () => {
      try { resolve(JSON.parse(answer)) } catch { reject(new Error('hq answered with something other than a result')) }
    })
  })
}

async function waitForHq(socket) {
  const until = Date.now() + WAIT_MS
  for (;;) {
    try {
      return await send(socket, 'provider', ['list'])
    } catch (err) {
      if (Date.now() > until) throw new Error(`hq's control socket did not answer in ${WAIT_MS / 60_000} minutes (${socket})`)
      await new Promise((r) => setTimeout(r, RETRY_MS))
    }
  }
}

async function main() {
  if (!fs.existsSync(ENV_FILE)) return
  const env = readEnv(ENV_FILE)
  const wanted = VENDORS.filter(([name]) => env[name])
  if (!wanted.length) return

  const socket = socketPath()
  const listed = await waitForHq(socket)
  if (!listed.ok) throw new Error(listed.error)
  const have = new Set(listed.data.providers.map((p) => p.vendor))

  for (const [name, vendor] of wanted) {
    if (have.has(vendor)) continue
    const result = await send(socket, 'provider', ['add', vendor, env[name]])
    say(result.ok ? result.text : `${vendor} not added: ${result.error}`)
  }
}

main().catch((err) => {
  say(err.message)
  process.exit(1)
})
