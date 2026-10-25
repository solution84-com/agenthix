#!/usr/bin/env node
// What the registry cleanup deletes, per image of this repository:
//   node scripts/release/cleanup.mjs --out <plan.json>
// Every release's record (release.json) is read first. A version is deleted only when it is untagged (and more than
// a week old, so nothing still being pushed is touched), or tagged build-… only and more than 90 days old; and in both
// cases only when no release record names it, nothing kept refers to it (as an index's platform image), and it is not
// a signature or attestation of something kept. A version with any other tag, a release's version tag above all, is
// never deleted. Writes the plan, [{package, id, digest, reason}], and deletes nothing: the workflow does that.
// Needs gh (GH_TOKEN, GITHUB_REPOSITORY), IMAGE_NAMES (each part's image name, {part: name}, as the release build
// works them out) and docker buildx with a registry login, to read manifests. Each image is asked for by its name: the
// workflow's own token may read this repository's packages, and is refused a listing of all the owner's.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DAY = 86_400_000
export const BUILD_TAG_DAYS = 90
export const UNTAGGED_DAYS = 7

/** The digests every release record names. */
export function recordedDigests(records) {
  const out = new Set()
  for (const r of records) for (const p of Object.values(r.parts ?? {})) {
    if (p.index) out.add(p.index)
    for (const d of Object.values(p.platforms ?? {})) out.add(d)
  }
  return out
}

/**
 * versions: [{id, digest, created_at, tags}] of one image; manifestOf(digest) returns its manifest, or throws.
 * Returns [{id, digest, reason}] to delete.
 */
export function planDeletions({ versions, recorded, manifestOf, now }) {
  const age = v => Math.floor((now - Date.parse(v.created_at)) / DAY)
  const candidate = v => {
    if (recorded.has(v.digest)) return null
    if (v.tags.length === 0) return age(v) > UNTAGGED_DAYS ? `untagged, ${age(v)} days old` : null
    if (v.tags.every(t => t.startsWith('build-')) && age(v) > BUILD_TAG_DAYS) return `tagged ${v.tags.join(', ')} only, ${age(v)} days old`
    return null
  }
  const reasons = new Map(versions.map(v => [v.digest, candidate(v)]))
  const kept = new Set(versions.filter(v => !reasons.get(v.digest)).map(v => v.digest))
  // A manifest that cannot be read is kept, and so is what it may refer to: refused, never guessed.
  const manifests = new Map()
  const read = digest => {
    if (!manifests.has(digest)) {
      try { manifests.set(digest, manifestOf(digest)) } catch { manifests.set(digest, undefined) }
    }
    return manifests.get(digest)
  }
  for (const v of versions) if (kept.has(v.digest) && read(v.digest) === undefined) {
    throw new Error(`The manifest of kept image ${v.digest} cannot be read, so what it refers to is unknown. Nothing is deleted.`)
  }
  for (let changed = true; changed;) {
    changed = false
    for (const v of versions) {
      const m = read(v.digest)
      const keep = d => { if (reasons.get(d) && !kept.has(d)) { kept.add(d); changed = true } }
      if (kept.has(v.digest)) for (const child of m?.manifests ?? []) keep(child.digest)
      else if (m === undefined || (m.subject && (kept.has(m.subject.digest) || !reasons.has(m.subject.digest)))) {
        // Unreadable, or a signature or attestation of an image that stays (or is not this image's to judge).
        keep(v.digest)
      }
    }
  }
  return versions.filter(v => !kept.has(v.digest)).map(v => ({ id: v.id, digest: v.digest, reason: reasons.get(v.digest) }))
}

/** IMAGE_NAMES as the release build writes it: {part: image name}, each a bare registry name. */
export function imageNames(json) {
  const names = JSON.parse(json ?? 'null')
  if (!names || typeof names !== 'object' || Array.isArray(names) || Object.keys(names).length === 0) {
    throw new Error('IMAGE_NAMES must name each part\'s image, {part: name}.')
  }
  for (const [part, name] of Object.entries(names)) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`${part}: ${name} is not an image name.`)
  }
  return [...new Set(Object.values(names))]
}

const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
const ghJson = path => JSON.parse(gh(['api', '--paginate', '--slurp', path])).flat()

function readRecords(repository) {
  const releases = ghJson(`repos/${repository}/releases?per_page=100`)
  const records = []
  for (const r of releases) {
    if (!r.assets.some(a => a.name === 'release.json')) continue
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-'))
    gh(['release', 'download', r.tag_name, '--repo', repository, '--pattern', 'release.json', '--dir', dir])
    records.push(JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8')))
  }
  return records
}

function main() {
  const out = process.argv[process.argv.indexOf('--out') + 1]
  if (!out || !process.argv.includes('--out')) throw new Error('--out is required.')
  const repository = process.env.GITHUB_REPOSITORY ?? (() => { throw new Error('GITHUB_REPOSITORY is not set.') })()
  const owner = repository.split('/')[0]
  const base = JSON.parse(gh(['api', `users/${owner}`])).type === 'Organization' ? `orgs/${owner}` : `users/${owner}`
  const recorded = recordedDigests(readRecords(repository))
  const plan = []
  for (const imageName of imageNames(process.env.IMAGE_NAMES)) {
    const name = encodeURIComponent(imageName)
    let pkg
    try {
      pkg = JSON.parse(gh(['api', `${base}/packages/container/${name}`]))
    } catch (err) {
      // An image never published yet has no package: nothing of it to delete.
      if (/HTTP 404/.test(String(err.stderr ?? err.message))) { console.error(`${imageName}: not in the registry.`); continue }
      throw err
    }
    // The workflow's token may be given the package without its repository; a package that names another one is left.
    if (pkg.repository && pkg.repository.full_name !== repository) { console.error(`${imageName}: belongs to another repository, left alone.`); continue }
    const versions = ghJson(`${base}/packages/container/${name}/versions?per_page=100`)
      .map(v => ({ id: v.id, digest: v.name, created_at: v.created_at, tags: v.metadata?.container?.tags ?? [] }))
    const image = `ghcr.io/${owner.toLowerCase()}/${pkg.name}`
    const manifestOf = digest => JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', `${image}@${digest}`], { encoding: 'utf8' }))
    for (const d of planDeletions({ versions, recorded, manifestOf, now: Date.now() })) {
      plan.push({ package: pkg.name, path: `${base}/packages/container/${name}/versions/${d.id}`, ...d })
    }
    console.error(`${pkg.name}: ${versions.length} versions, ${plan.filter(p => p.package === pkg.name).length} to delete.`)
  }
  fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
