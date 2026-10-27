// Files for filesFrame.spec.ts: one of each kind the frame draws, in the e2e administrator's own Files, in a folder
// `e2e-files`. HQ has no operation that writes a place's file (agents write them), so they are written straight into
// the development site's storage, at the path the site keeps a person's files: {SITE_ROOT}/users/<id>/files. Run it
// after seed-e2e-users.mjs, on the machine the site runs on; it can be run again and writes the same files. SITE_ROOT
// comes from the environment, else site/.env.server, else the site's default (site/site). Prints the line to export:
//   E2E_FILES_FOLDER   the folder in the administrator's Files holding the files
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { crc32, deflateSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(hqRoot, '..')

function parseEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    const eq = line.indexOf('=')
    if (!line || line.startsWith('#') || eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, '')
  }
  return out
}
const hqEnv = { ...parseEnvFile(resolve(hqRoot, '.env.server')), ...process.env }
const siteEnv = { ...parseEnvFile(resolve(repoRoot, 'site/.env.server')), ...process.env }
const rawRoot = siteEnv.SITE_ROOT || join(repoRoot, 'site', 'site')
const siteRoot = rawRoot.startsWith('~/') ? join(homedir(), rawRoot.slice(2)) : rawRoot

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: hqEnv.DATABASE_URL } } })
const identity = await prisma.authIdentity.findUnique({
  where: { providerName_providerUserId: { providerName: 'username', providerUserId: 'e2e-admin' } }, include: { auth: true },
})
await prisma.$disconnect()
if (!identity) { console.error('[seed-e2e-files] there is no e2e administrator; run seed-e2e-users.mjs first'); process.exit(1) }

const FOLDER = 'e2e-files'
const dir = join(siteRoot, 'users', identity.auth.userId, 'files', FOLDER)

/** A `size`×`size` picture, all one colour. */
function png(size) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([length, Buffer.from(type), data, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x5a)])
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A one-page PDF saying `text`, with a correct cross-reference table. */
function pdf(text) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = `BT /F1 18 Tf 24 72 Td (${text}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const files = {
  'notes.md': [
    '# Seeing the work', '',
    'A chart drawn from beside this page:', '',
    '![Q3 chart](charts/q3.png)', '',
    'The same chart, sized:', '',
    '<img src="charts/q3.png" alt="Q3 sized" width="120">', '',
  ].join('\n'),
  'charts/q3.png': png(64),
  'app.ts': 'export function greet(name: string): string {\n  return `Hello, ${name}`\n}\n',
  'data.csv': 'region,quarter,revenue\nNorth,Q3,1200\nSouth,Q3,950\n"East, coast",Q3,1430\n',
  'report.pdf': pdf('Seeing the work'),
}

for (const [name, body] of Object.entries(files)) {
  const path = join(dir, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}
console.log(`export E2E_FILES_FOLDER=${FOLDER}`)
