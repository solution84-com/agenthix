// Adds a provider (AssemblyAI, Inworld or OpenRouter) to the database of the HQ under test, as a working provider with an
// obviously fake key, encrypted as HQ stores one (fake-providers.mjs). A key check reaches the vendor's own address, which no test may,
// so the specs and recipes that walk through setup answer the browser's add-provider call themselves, or leave the form
// unsaved, and call this to make the stored state match.
//
//   DATABASE_URL=postgresql://… node e2e/fixtures/add-provider.mjs assemblyai|inworld|openrouter        (from hq/)
//
// DATABASE_URL falls back to hq/.env.server; the key to encrypt with is SECRETS_MASTER_KEY, from there too.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addFakeProvider } from './fake-providers.mjs'

const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LABELS = { assemblyai: 'AssemblyAI', inworld: 'Inworld', openrouter: 'OpenRouter' }

const vendor = process.argv[2]
if (!LABELS[vendor]) {
  console.error('Usage: add-provider.mjs assemblyai|inworld|openrouter')
  process.exit(2)
}

let url = process.env.DATABASE_URL
const envFile = resolve(hqRoot, '.env.server')
if (!url && existsSync(envFile)) url = readFileSync(envFile, 'utf8').match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1]
if (!url) {
  console.error('DATABASE_URL is needed: the database of the HQ under test.')
  process.exit(2)
}

const { PrismaClient } = createRequire(import.meta.url)('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url } } })
try {
  await addFakeProvider(db, hqRoot, { vendor, name: LABELS[vendor] })
} finally {
  await db.$disconnect()
}
