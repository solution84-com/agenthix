#!/usr/bin/env node
// Moves every action the workflows pin by commit (`uses: owner/repo@<commit> # vX.Y.Z`) to the newest release of the
// same major: its commit and its comment. Tags are read with `git ls-remote` over HTTPS, which needs no token and has no
// API rate limit. Run by scripts/deps/update.sh; writes what moved, as JSON, to --out.
//   node scripts/deps/actions.mjs --out <file>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newestWithin } from './versions.mjs'

const USES = /uses:\s+([\w.-]+\/[\w.-]+(?:\/[\w./-]+)?)@([0-9a-f]{40})\s+#\s+(v?\d+\.\d+\.\d+)\b/g

export function parseUses(text) {
  return [...text.matchAll(USES)].map(m => ({ action: m[1], repo: m[1].split('/').slice(0, 2).join('/'), commit: m[2], version: m[3] }))
}

/** Each tag and the commit it points to, from `git ls-remote --tags`. */
export function parseLsRemote(out) {
  const tags = new Map()
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line)
    if (!m) continue
    if (m[3] || !tags.has(m[2])) tags.set(m[2], m[1])
  }
  return tags
}

/** The newest release of `current`'s major, or null when the repository has none (not even `current`). */
export function newestRelease(current, tags) {
  const releases = [...tags.keys()].filter(t => /^v?\d+\.\d+\.\d+$/.test(t))
  const version = newestWithin(current, releases)
  return tags.has(version) ? { version, commit: tags.get(version) } : null
}

function main() {
  const out = process.argv[process.argv.indexOf('--out') + 1]
  if (!process.argv.includes('--out') || !out) throw new Error('Usage: node scripts/deps/actions.mjs --out <file>')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const files = execFileSync('git', ['ls-files', '.github/workflows', '.github/actions'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(f => /\.ya?ml$/.test(f))
  const texts = new Map(files.map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]))
  const pins = [...texts.values()].flatMap(parseUses)

  const tagsOf = new Map()
  for (const repo of new Set(pins.map(p => p.repo))) {
    const listed = execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}.git`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    tagsOf.set(repo, parseLsRemote(listed))
  }

  const moves = []
  const seen = new Set()
  for (const pin of pins) {
    const next = newestRelease(pin.version, tagsOf.get(pin.repo))
    if (!next) throw new Error(`${pin.repo} has no release ${pin.version}, the version the workflows name.`)
    if (next.version === pin.version) {
      // A release tag that now points elsewhere is not an update: the pin by commit is there to notice exactly this.
      if (next.commit !== pin.commit) throw new Error(`${pin.repo}'s tag ${pin.version} now points to ${next.commit}, not the pinned ${pin.commit}: find out why before moving it.`)
      continue
    }
    for (const [f, text] of texts) {
      texts.set(f, text.replaceAll(`${pin.action}@${pin.commit} # ${pin.version}`, `${pin.action}@${next.commit} # ${next.version}`))
    }
    const move = { module: 'actions', name: pin.action, from: pin.version, to: next.version }
    const key = JSON.stringify(move)
    if (!seen.has(key)) { seen.add(key); moves.push(move) }
  }
  for (const [f, text] of texts) if (text !== fs.readFileSync(path.join(root, f), 'utf8')) fs.writeFileSync(path.join(root, f), text)
  fs.writeFileSync(out, `${JSON.stringify(moves, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`Actions: ${error.message}`); process.exit(1) }
}
