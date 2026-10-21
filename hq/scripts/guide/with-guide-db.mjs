#!/usr/bin/env node
// Runs a command with hq and the site pointed at their guide databases, the databases the user guide's
// screenshots are made from (ADR-0035's pattern, as scripts/test/with-test-db.mjs does for tests).
//
// The guide databases sit on the same servers as the developer's own, with only the name swapped:
// `agenthix_guide` for hq and `agenthix_site_guide` for the site. Each address is derived from that
// app's DATABASE_URL in its .env.server. Where there is no .env.server (CI), set GUIDE_HQ_DATABASE_URL
// and GUIDE_SITE_DATABASE_URL instead; an address set that way is used as given.
//
// Hard guard: refuses to run unless both database names end in `_guide`, so the truncation the sample
// organisation's seed does can never reach a developer's data.
//
// Before handing off it creates each database if it is missing and applies the committed migrations
// (`prisma migrate deploy`), as with-test-db.mjs does.
//
// The command's environment is the caller's, plus:
//   DATABASE_URL               hq's guide database. hq reads its own DATABASE_URL, so it needs nothing else.
//   HQ_STORAGE_ROOT            where hq keeps its own files: the caller's, or a directory under the temporary one,
//                              as an installed HQ has one (Infrastructure then reads "Kept where HQ_STORAGE_ROOT says")
//   GUIDE_HQ_DATABASE_URL      hq's guide database
//   GUIDE_SITE_DATABASE_URL    the site's guide database. The site also reads DATABASE_URL, so start it as
//                              `DATABASE_URL="$GUIDE_SITE_DATABASE_URL" npm run dev` inside the command.
// Neither app's .env.server is copied into the command's environment: each app still reads its own, and
// a variable set here wins over the file (dotenv and node --env-file never override the environment).
// The command runs in the directory the caller is in.
//
// Options, before the command:
//   --reset   drop both guide databases first, so they are created and migrated empty. The fresh-install
//             recipes need that; the sample organisation's seed does not (it empties them itself).
//
//   node hq/scripts/guide/with-guide-db.mjs --reset true            # create and migrate both, empty
//   node hq/scripts/guide/with-guide-db.mjs node hq/e2e/fixtures/seed-guide-data.mjs
//   node hq/scripts/guide/with-guide-db.mjs bash -c 'cd site && DATABASE_URL="$GUIDE_SITE_DATABASE_URL" npm run dev'

import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertGuideDatabase, databaseNameOf, guideStorageRoot, guideUrls, urlWithDatabase } from './databaseUrls.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const hqRoot = resolve(here, '../..')
const siteRoot = resolve(hqRoot, '../site')

const argv = process.argv.slice(2)
let reset = false
while (argv[0]?.startsWith('--')) {
  const option = argv.shift()
  if (option === '--reset') reset = true
  else fail(`unknown option ${option}`)
}
const [cmd, ...args] = argv
if (!cmd) fail('usage: with-guide-db.mjs [--reset] <command> [args...]')

function fail(message) {
  console.error(`[with-guide-db] ${message}`)
  process.exit(1)
}

function devDatabaseUrl(envPath) {
  if (!existsSync(envPath)) return null
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('DATABASE_URL=')) return line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')
  }
  return null
}

let urls
try {
  urls = guideUrls({
    env: process.env,
    hqDevUrl: devDatabaseUrl(resolve(hqRoot, '.env.server')),
    siteDevUrl: devDatabaseUrl(resolve(siteRoot, '.env.server')),
  })
} catch (err) {
  fail(err.message)
}

function run(command, commandArgs, options) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { ...options, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('exit', (status) => done({ status, output }))
    child.stdin.end(options.input ?? '')
  })
}

// Postgres has no CREATE DATABASE IF NOT EXISTS, so attempt it and ignore "already exists". It runs on the
// admin `postgres` database of the same server. The name reaching raw DDL has passed assertGuideDatabase
// and only ever comes from the URL's path segment, never from request input.
async function prepare({ url, root, label }) {
  const name = assertGuideDatabase(url, label)
  const admin = urlWithDatabase(url, 'postgres')
  const quoted = `"${name.replaceAll('"', '""')}"`
  if (reset) {
    const dropped = await run('npx', ['prisma', 'db', 'execute', '--stdin', '--url', admin], {
      cwd: root, input: `DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`,
    })
    if (dropped.status !== 0) return `failed to drop the ${label} guide database ${name}:\n${dropped.output}`
  }
  const created = await run('npx', ['prisma', 'db', 'execute', '--stdin', '--url', admin], {
    cwd: root, input: `CREATE DATABASE ${quoted}`,
  })
  if (created.status !== 0 && !/already exists/i.test(created.output)) {
    return `failed to create the ${label} guide database ${name}:\n${created.output}`
  }
  const migrated = await run('npx', ['prisma', 'migrate', 'deploy'], { cwd: root, env: { ...process.env, DATABASE_URL: url } })
  if (migrated.status !== 0) return `failed to apply migrations to the ${label} guide database ${name}:\n${migrated.output}`
  return null
}

// hq's schema.prisma sits at the app root with migrations/ beside it, as does the site's.
const problems = [
  await prepare({ url: urls.hq, root: hqRoot, label: 'hq' }),
  await prepare({ url: urls.site, root: siteRoot, label: 'site' }),
].filter(Boolean)
if (problems.length > 0) fail(problems.join('\n'))

const storageRoot = guideStorageRoot(process.env, tmpdir())
mkdirSync(storageRoot, { recursive: true })
const childEnv = {
  ...process.env,
  HQ_STORAGE_ROOT: storageRoot,
  DATABASE_URL: urls.hq,
  GUIDE_HQ_DATABASE_URL: urls.hq,
  GUIDE_SITE_DATABASE_URL: urls.site,
}
console.error(`[with-guide-db] hq → ${databaseNameOf(urls.hq)}, site → ${databaseNameOf(urls.site)}${reset ? ' (recreated empty)' : ''}`)
const child = spawn(cmd, args, { stdio: 'inherit', env: childEnv })
child.on('exit', (code) => process.exit(code ?? 0))
