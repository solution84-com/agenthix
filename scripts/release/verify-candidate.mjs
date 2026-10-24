#!/usr/bin/env node
// The tag's check of where each image came from, before anything is signed:
//   node scripts/release/verify-candidate.mjs --candidate <candidate.json> --keys <keys.json> --commit <sha> --tree <sha> --registry <registry> --out <file>
// <keys.json> holds each part's content key recomputed at the tagged commit (scripts/images/keys.mjs <commit> --json).
// The candidate must be for that commit and tree, list exactly those parts, each under the registry, with the key
// recomputed here; and each platform digest must be the one build attestation of release-build.yml on main or a release
// branch names for that part, architecture and key: reuse.sh decides that, the same check the release build makes
// before it reuses an image (REUSE names another script, for tests). Every mismatch is reported, naming the part and
// what differed. On success writes the parts to promote, a JSON array of {part, image, key, amd64, arm64}.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ARCHITECTURES = ['amd64', 'arm64']
const DIGEST = /^sha256:[0-9a-f]{64}$/

/** `reuse(image, part, arch, key)` returns { ok, digest, reason }. Returns { problems, promote }. */
export function verifyCandidate({ candidate, keys, commit, tree, registry, reuse }) {
  const problems = []
  if (candidate.commit !== commit) problems.push(`The candidate is for commit ${candidate.commit}, not the tagged commit ${commit}.`)
  if (candidate.tree !== tree) problems.push(`The candidate is for tree ${candidate.tree}, not the tagged commit's tree ${tree}.`)
  const parts = candidate.parts ?? {}
  for (const part of Object.keys(keys)) if (!(part in parts)) problems.push(`${part}: the tagged commit has this part, and the candidate has no image for it.`)
  for (const part of Object.keys(parts)) if (!(part in keys)) problems.push(`${part}: the candidate has an image for it, and the tagged commit has no such part.`)
  const promote = []
  for (const [part, p] of Object.entries(parts)) {
    if (!(part in keys)) continue
    const expected = keys[part]
    if (p.key !== expected) {
      problems.push(`${part}: the candidate's key is ${p.key}; the key recomputed at the tagged commit is ${expected}.`)
      continue
    }
    if (typeof p.image !== 'string' || !p.image.startsWith(`${registry}/`) || !/^[a-z0-9][a-z0-9._-]*$/.test(p.image.slice(registry.length + 1))) {
      problems.push(`${part}: the candidate's image ${p.image} is not a name under ${registry}.`)
      continue
    }
    const entry = { part, image: p.image, key: expected }
    for (const arch of ARCHITECTURES) {
      const digest = p.platforms?.[arch]?.digest
      if (!DIGEST.test(digest ?? '')) { problems.push(`${part} (${arch}): the candidate has no digest.`); continue }
      const found = reuse(p.image, part, arch, expected)
      if (!found.ok) problems.push(`${part} (${arch}): ${found.reason}`)
      else if (found.digest !== digest) problems.push(`${part} (${arch}): the attested image for key ${expected} is ${found.digest}; the candidate's is ${digest}.`)
      else entry[arch] = digest
    }
    if (ARCHITECTURES.every(a => entry[a])) promote.push(entry)
  }
  return { problems, promote }
}

function reuseScript(image, part, arch, key) {
  const r = spawnSync(process.env.REUSE ?? path.join(here, 'reuse.sh'), [image, part, arch, key], { encoding: 'utf8' })
  return r.status === 0
    ? { ok: true, digest: r.stdout.trim() }
    : { ok: false, reason: (r.stderr || r.error?.message || `reuse.sh exited ${r.status}`).trim() }
}

function main() {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
  const need = name => arg(name) ?? (() => { throw new Error(`--${name} is required.`) })()
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
  const { problems, promote } = verifyCandidate({
    candidate: read(need('candidate')), keys: read(need('keys')), commit: need('commit'), tree: need('tree'), registry: need('registry'), reuse: reuseScript,
  })
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`)
    console.error('The candidate is not what the tagged commit builds, so nothing is signed. Start the release build again for this commit, let it pass, then re-run this workflow. Nothing was changed.')
    process.exit(1)
  }
  fs.writeFileSync(need('out'), JSON.stringify(promote) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
