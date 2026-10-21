#!/usr/bin/env node
/**
 * Writes the model catalogue an OpenCode binary was built with, as the JSON
 * OpenCode reads from `OPENCODE_MODELS_PATH`.
 *
 *   node extract-models.mjs <opencode binary> <output.json>
 *
 * OpenCode compiles a snapshot of the models.dev catalogue into its binary as
 * a minified object literal (`OPENCODE_MODELS_DEV`, script/build.ts). The
 * image ships that same snapshot as a file so the server never reads the
 * catalogue cached in the writable home, and so the platform's model list
 * can be generated from exactly what the pinned version knows.
 *
 * The literal is found by its shape — `(()=>({<key>:{id:"<key>",` — and read
 * by scanning to its closing brace outside string literals, then evaluated in
 * an empty context. Anything unexpected fails the build: an upgrade that
 * changes how the snapshot is embedded must be looked at, not guessed past.
 */
import fs from 'node:fs'
import vm from 'node:vm'

const REQUIRED_PROVIDERS = ['openrouter', 'openai', 'google', 'anthropic']
const MIN_PROVIDERS = 50

function fail(message) {
  console.error(`extract-models: ${message}`)
  process.exit(1)
}

function findStart(text) {
  const re = /\(\(\)=>\(\{("?)([A-Za-z0-9_-]+)\1:\{id:"([^"]+)"/g
  const starts = []
  for (let m; (m = re.exec(text)); ) {
    if (m[2] === m[3]) starts.push(m.index + '(()=>('.length)
  }
  if (starts.length !== 1) fail(`expected one catalogue literal, found ${starts.length}`)
  return starts[0]
}

/** Index just past the brace that closes the object opening at `start`. */
function findEnd(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  fail('the catalogue literal never closes')
}

const [binaryPath, outPath] = process.argv.slice(2)
if (!binaryPath || !outPath) fail('usage: extract-models.mjs <opencode binary> <output.json>')

// latin1 keeps one character per byte, so offsets found here are byte offsets.
const bytes = fs.readFileSync(binaryPath)
const text = bytes.toString('latin1')
const start = findStart(text)
const end = findEnd(text, start)
const source = bytes.subarray(start, end).toString('utf8')

const catalogue = vm.runInNewContext(`(${source})`, Object.create(null), { timeout: 10_000 })
const providers = Object.entries(catalogue)
if (providers.length < MIN_PROVIDERS) fail(`only ${providers.length} providers`)
for (const [id, p] of providers) {
  if (!p || p.id !== id || typeof p.models !== 'object') fail(`provider ${id} is malformed`)
}
for (const id of REQUIRED_PROVIDERS) {
  if (!catalogue[id] || Object.keys(catalogue[id].models).length === 0) fail(`no models for ${id}`)
}

fs.writeFileSync(outPath, JSON.stringify(catalogue))
console.log(`extract-models: ${providers.length} providers written to ${outPath}`)
