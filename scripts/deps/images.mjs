#!/usr/bin/env node
// Moves every base image to the newest digest of its tag, and its tag to the newest of the same shape within its major
// (Alpine 3.23 to 3.24; Caddy's 2-alpine keeps its tag). Node moves to one version every variant in use has, within the
// major .nvmrc names, and that version is then written everywhere the old one is named: .nvmrc, every Dockerfile, each
// module's engines, comments, docs and test scripts. cosign moves in the host image and the workflows' COSIGN_VERSION
// together. Run by scripts/deps/update.sh; writes what moved, as JSON, to --out.
//   node scripts/deps/images.mjs --out <file>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listTags, tagDigest } from './registry.mjs'
import { compareNumbers, parseVersionTag } from './versions.mjs'

const FROM = /^FROM\s+(?:--platform=\S+\s+)?([^\s@:]+(?:\/[^\s@:]+)*):([^\s@]+)@(sha256:[0-9a-f]{64})/gm
// Records of what was, never rewritten: the units of work and the decision records; and these scripts, whose tests
// name versions as examples.
const NOT_REWRITTEN = [/package-lock\.json$/, /^docs\/work\//, /^docs\/adr\//, /^scripts\/deps\//]
const COSIGN = /(^|\/)sigstore\/cosign\/cosign$/

export function parseFromLines(text) {
  return [...text.matchAll(FROM)].map(m => ({ name: m[1], tag: m[2], digest: m[3] }))
}

/** For each pinned name:tag, the tag it moves to. One version per image and shape, which every suffix in use has. */
export function planImages(pins, tagsByName) {
  const plan = new Map()
  const groups = new Map()
  for (const pin of pins) {
    const v = parseVersionTag(pin.tag)
    if (!v) { plan.set(`${pin.name}:${pin.tag}`, pin.tag); continue }
    const key = `${pin.name}|${v.prefix}|${v.numbers.length}|${v.numbers[0]}`
    if (!groups.has(key)) groups.set(key, { name: pin.name, shape: v, tags: new Map() })
    groups.get(key).tags.set(pin.tag, v)
  }
  for (const { name, shape, tags } of groups.values()) {
    const suffixes = new Set([...tags.values()].map(v => v.suffix))
    const available = new Map([...suffixes].map(s => [s, new Set()]))
    for (const tag of tagsByName[name] ?? []) {
      const v = parseVersionTag(tag)
      if (!v || v.prefix !== shape.prefix || v.numbers.length !== shape.numbers.length || v.numbers[0] !== shape.numbers[0]) continue
      available.get(v.suffix)?.add(v.numbers.join('.'))
    }
    const common = [...available.values()].reduce((a, b) => new Set([...a].filter(x => b.has(x))))
    const newest = [...common].map(s => s.split('.').map(Number)).sort(compareNumbers).at(-1)
    for (const [tag, v] of tags) {
      const moves = newest && compareNumbers(newest, v.numbers) > 0
      plan.set(`${name}:${tag}`, moves ? `${v.prefix}${newest.join('.')}${v.suffix}` : tag)
    }
  }
  return plan
}

export function replaceNodeVersion(text, from, to) {
  const escaped = from.replace(/\./g, '\\.')
  return text.replace(new RegExp(`(?<![\\d.])${escaped}(?!\\d|\\.\\d)`, 'g'), to)
}

const short = digest => digest.slice('sha256:'.length, 'sha256:'.length + 12)
const nodeVersion = tag => parseVersionTag(tag).numbers.join('.')

async function main() {
  const out = process.argv[process.argv.indexOf('--out') + 1]
  if (!process.argv.includes('--out') || !out) throw new Error('Usage: node scripts/deps/images.mjs --out <file>')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  const dockerfiles = tracked.filter(f => /(^|\/)([^/]*\.)?Dockerfile$/.test(f))
  const read = f => fs.readFileSync(path.join(root, f), 'utf8')
  const texts = new Map(dockerfiles.map(f => [f, read(f)]))
  const pins = dockerfiles.flatMap(f => parseFromLines(texts.get(f)).map(p => ({ ...p, file: f })))

  const nvmrc = read('.nvmrc').trim()
  const nodePins = pins.filter(p => p.name === 'node')
  const nodeNow = new Set(nodePins.map(p => nodeVersion(p.tag)))
  if (nodeNow.size > 1 || (nodeNow.size === 1 && !nodeNow.has(nvmrc))) {
    throw new Error(`The Dockerfiles name Node ${[...nodeNow].join(', ')} and .nvmrc names ${nvmrc}: they must name one version before an update.`)
  }

  const names = [...new Set(pins.map(p => p.name))]
  const tagsByName = Object.fromEntries(await Promise.all(names.map(async n => [n, await listTags(n)])))
  const plan = planImages(pins, tagsByName)
  const digests = new Map()
  const digestOf = async (name, tag) => {
    const key = `${name}:${tag}`
    if (!digests.has(key)) digests.set(key, await tagDigest(name, tag))
    return digests.get(key)
  }

  const moves = []
  const seen = new Set()
  let cosign = null
  for (const pin of pins) {
    const tag = plan.get(`${pin.name}:${pin.tag}`)
    const digest = await digestOf(pin.name, tag)
    if (tag === pin.tag && digest === pin.digest) continue
    texts.set(pin.file, texts.get(pin.file).replaceAll(`${pin.name}:${pin.tag}@${pin.digest}`, `${pin.name}:${tag}@${digest}`))
    const module = pin.file.split('/')[0]
    const move = { module, name: pin.name, from: `${pin.tag}@${short(pin.digest)}`, to: `${tag}@${short(digest)}` }
    const key = JSON.stringify(move)
    if (!seen.has(key)) { seen.add(key); moves.push(move) }
    if (COSIGN.test(pin.name) && tag !== pin.tag) cosign = { from: pin.tag, to: tag }
  }
  for (const [f, text] of texts) if (text !== read(f)) fs.writeFileSync(path.join(root, f), text)

  const nodeTo = nodePins.length ? nodeVersion(plan.get(`node:${nodePins[0].tag}`)) : nvmrc
  if (nodeTo !== nvmrc) {
    moves.push({ module: 'Node', name: 'Node.js', from: nvmrc, to: nodeTo })
    for (const f of tracked) {
      // Symlinks (a directory's, or CLAUDE.md's to AGENTS.md) are skipped: what they point to is tracked itself.
      if (NOT_REWRITTEN.some(r => r.test(f)) || !fs.lstatSync(path.join(root, f), { throwIfNoEntry: false })?.isFile()) continue
      const buf = fs.readFileSync(path.join(root, f))
      if (buf.subarray(0, 8000).includes(0)) continue
      const text = buf.toString('utf8')
      const next = replaceNodeVersion(text, nvmrc, nodeTo)
      if (next !== text) fs.writeFileSync(path.join(root, f), next)
    }
    // A lockfile repeats its own module's engines; the Node versions its packages require are theirs, not ours.
    for (const f of tracked.filter(t => t.endsWith('package-lock.json'))) {
      const lock = JSON.parse(read(f))
      const own = lock.packages?.['']?.engines
      if (own?.node !== `>=${nvmrc}`) continue
      own.node = `>=${nodeTo}`
      fs.writeFileSync(path.join(root, f), `${JSON.stringify(lock, null, 2)}\n`)
    }
  }

  if (cosign) {
    for (const f of tracked.filter(t => t.startsWith('.github/workflows/'))) {
      const text = read(f)
      const found = [...text.matchAll(/COSIGN_VERSION: (\S+)/g)].map(m => m[1])
      if (found.some(v => v !== cosign.from)) throw new Error(`${f} names cosign ${found.join(', ')}, not the host image's ${cosign.from}.`)
      if (found.length) fs.writeFileSync(path.join(root, f), text.replaceAll(`COSIGN_VERSION: ${cosign.from}`, `COSIGN_VERSION: ${cosign.to}`))
    }
  }
  fs.writeFileSync(out, `${JSON.stringify(moves, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Base images: ${error.message}`); process.exit(1) })
}
