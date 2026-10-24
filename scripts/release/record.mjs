#!/usr/bin/env node
// The release record, release.json, attached to the release page:
//   node scripts/release/record.mjs --version <v> --commit <sha> --tree <sha> --published <folder> --core <file.tgz> --host-images <published.ts> --out <file>
// <folder> holds one JSON file per part, as the tag's publish jobs write them: {part, image, key, index, amd64, arm64}.
// Core's name, version and integrity come from the packed file itself; the Postgres image from the host service's
// source, where it is pinned (POSTGRES_IMAGE). The record is for people and for rebuilding a release: a host service
// finds a version by its tag and signature, never by this file.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIGEST = /^sha256:[0-9a-f]{64}$/

export function postgresImage(source) {
  const m = /export const POSTGRES_IMAGE = '([^']+@(sha256:[0-9a-f]{64}))'/.exec(source)
  if (!m) throw new Error('POSTGRES_IMAGE, pinned by digest, is not in the host service\'s source.')
  return { image: m[1], digest: m[2] }
}

export function corePackage(tgz) {
  const pkg = JSON.parse(execFileSync('tar', ['-xOzf', tgz, 'package/package.json'], { encoding: 'utf8' }))
  const integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64')}`
  return { name: pkg.name, version: pkg.version, integrity }
}

export function buildRecord({ version, commit, tree, published, core, postgres }) {
  if (core.version !== version) throw new Error(`The packed core package is ${core.version}, not ${version}.`)
  const parts = {}
  for (const p of [...published].sort((a, b) => a.part.localeCompare(b.part))) {
    for (const d of [p.index, p.amd64, p.arm64]) if (!DIGEST.test(d ?? '')) throw new Error(`${p.part}: ${d} is not a digest.`)
    if (parts[p.part]) throw new Error(`${p.part} is published twice.`)
    parts[p.part] = { key: p.key, image: p.image, index: p.index, platforms: { amd64: p.amd64, arm64: p.arm64 } }
  }
  if (Object.keys(parts).length === 0) throw new Error('No published part.')
  return { version, commit, tree, parts, core, postgres }
}

function main() {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
  const need = name => arg(name) ?? (() => { throw new Error(`--${name} is required.`) })()
  const dir = need('published')
  const published = fs.readdirSync(dir, { recursive: true }).filter(f => String(f).endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, String(f)), 'utf8')))
  const record = buildRecord({
    version: need('version'), commit: need('commit'), tree: need('tree'), published,
    core: corePackage(need('core')), postgres: postgresImage(fs.readFileSync(need('host-images'), 'utf8')),
  })
  fs.writeFileSync(need('out'), JSON.stringify(record, null, 2) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
