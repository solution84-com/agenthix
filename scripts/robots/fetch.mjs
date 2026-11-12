#!/usr/bin/env node
// Puts the pinned robots bundle (hq/src/pictures/robotsBundle.ts) into hq's assets: downloads its archive, checks
// its SHA-256 against the pin, and checks every picture against the bundle's manifest before anything is written.
// Any mismatch stops it with nothing changed. Run by hq's image build, and once by a developer:
//
//   node scripts/robots/fetch.mjs [--out <folder>] [--from <archive>]
//
// --out defaults to hq/assets/robots/ (gitignored); --from checks and installs an archive already on disk instead
// of downloading it. While the repository is private the download needs a GitHub token: GH_TOKEN or GITHUB_TOKEN
// when set, otherwise the token of a signed-in `gh`.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROBOTS_BUNDLE } from '../../hq/src/pictures/robotsBundle.ts'
import { checkBundle, sha256 } from './bundle.mjs'
import { unpackTar } from './tar.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
const HEADERS = { 'User-Agent': 'agenthix-robots-fetch', 'X-GitHub-Api-Version': '2022-11-28' }

function githubToken() {
  const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (env) return env
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

async function readBody(res, what) {
  if (!res.ok) throw new Error(`${what}: GitHub answered ${res.status} ${res.statusText}`)
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_ARCHIVE_BYTES) throw new Error(`${what}: ${length} bytes is more than a robots bundle can be`)
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MAX_ARCHIVE_BYTES) throw new Error(`${what}: ${data.length} bytes is more than a robots bundle can be`)
  return data
}

/** The archive's bytes. With a token, through the API, which also serves a private repository's release assets. */
export async function download(pin, token = githubToken()) {
  const plain = async () => readBody(await fetch(pin.url, { headers: HEADERS }), `Downloading ${pin.url}`)
  if (!token) return plain()
  try {
    return await downloadWithToken(pin, token)
  } catch (err) {
    // A stale or unrelated token: a public repository still serves the asset without one.
    if (!/answered (401|403|404)/.test(String(err?.message))) throw err
    return plain()
  }
}

async function downloadWithToken(pin, token) {
  const asset = `${pin.bundle}.tar.gz`
  const auth = { ...HEADERS, Authorization: `Bearer ${token}` }
  const api = `https://api.github.com/repos/${pin.repository}`
  const release = await readBody(
    await fetch(`${api}/releases/tags/${encodeURIComponent(pin.bundle)}`, { headers: { ...auth, Accept: 'application/vnd.github+json' } }),
    `Finding the release ${pin.bundle} of ${pin.repository}`,
  )
  const found = JSON.parse(release.toString('utf8')).assets?.find((a) => a.name === asset)
  if (!found) throw new Error(`The release ${pin.bundle} of ${pin.repository} has no ${asset}`)
  // The API redirects to a signed address elsewhere; fetch does not carry the token across to it.
  return readBody(
    await fetch(`${api}/releases/assets/${found.id}`, { headers: { ...auth, Accept: 'application/octet-stream' } }),
    `Downloading ${asset}`,
  )
}

/** A folder `install` may replace: one that does not exist, is empty, or holds a robots bundle's manifest. */
export function isRobotsFolder(target) {
  if (!fs.existsSync(target)) return true
  if (!fs.statSync(target).isDirectory()) return false
  if (fs.readdirSync(target).length === 0) return true
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'))
    return typeof manifest.bundle === 'string' && manifest.bundle.startsWith('robots-')
  } catch {
    return false
  }
}

/** Checks the archive and writes the bundle's files into `out`, replacing what was there only once all are checked. */
export function install(archive, out, pin = ROBOTS_BUNDLE) {
  const digest = sha256(archive)
  if (digest !== pin.sha256) {
    throw new Error(`The robots archive's SHA-256 is ${digest}, not the pinned ${pin.sha256}: it is not ${pin.bundle}. Nothing was installed.`)
  }
  const files = unpackTar(archive)
  const manifest = checkBundle(files, pin)
  const target = path.resolve(out)
  if (!isRobotsFolder(target)) {
    throw new Error(`${target} holds files that are not a robots bundle; choose an empty or new folder. Nothing was installed.`)
  }
  const staging = `${target}.incoming-${process.pid}`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  try {
    for (const [name, data] of files) fs.writeFileSync(path.join(staging, name), data)
    fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(staging, target)
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw err
  }
  return manifest
}

async function main(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag)
    return i === -1 ? undefined : argv.splice(i, 2)[1]
  }
  const out = at('--out') ?? path.join(ROOT, 'hq/assets/robots')
  const from = at('--from')
  if (argv.length > 0) {
    console.error('Usage: node scripts/robots/fetch.mjs [--out <folder>] [--from <archive>]')
    process.exit(2)
  }
  const archive = from ? fs.readFileSync(from) : await download(ROBOTS_BUNDLE)
  const manifest = install(archive, out)
  console.log(`${manifest.bundle}: ${manifest.robots.length} robots in ${path.resolve(out)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
