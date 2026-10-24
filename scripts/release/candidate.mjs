#!/usr/bin/env node
// The release candidate's record, from the plan (plan.sh) and the digests the builds made:
//   node scripts/release/candidate.mjs --plan <file> --built <folder> --commit <sha> --tree <sha> --out <file> [--summary <file>]
// <folder> holds one JSON file ({part, arch, digest}) for each image that was built. Writes the record: the commit, its
// tree, and per part its content key and its platforms' digests, each reused or built; and, with --summary, a table
// for the run's page. It fails when an image planned for building has no digest, so a record is never half made.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function buildCandidate({ plan, built, commit, tree }) {
  const digests = new Map(built.map(b => [`${b.part}/${b.arch}`, b.digest]))
  const parts = {}
  for (const e of plan) {
    const digest = e.status === 'reused' ? e.digest : digests.get(`${e.part}/${e.arch}`)
    if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) throw new Error(`No digest for ${e.part} (${e.arch}), which was ${e.status === 'reused' ? 'reused' : 'to be built'}.`)
    parts[e.part] ??= { key: e.key, name: e.name, image: e.image, platforms: {} }
    parts[e.part].platforms[e.arch] = { digest, source: e.status === 'reused' ? 'reused' : 'built' }
  }
  return { commit, tree, parts }
}

export function summaryTable(candidate) {
  const rows = Object.entries(candidate.parts).flatMap(([part, p]) =>
    Object.entries(p.platforms).map(([arch, d]) => `| ${part} | ${arch} | ${d.source} | \`${p.key.slice(0, 12)}\` | \`${d.digest.slice(0, 19)}\` |`))
  return ['### Release candidate', '', `Commit \`${candidate.commit}\`, tree \`${candidate.tree}\``, '', '| Part | Architecture | Image | Key | Digest |', '|---|---|---|---|---|', ...rows, ''].join('\n')
}

function main() {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
  const need = name => arg(name) ?? (() => { throw new Error(`--${name} is required.`) })()
  const built = fs.existsSync(need('built'))
    ? fs.readdirSync(arg('built'), { recursive: true }).filter(f => String(f).endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(arg('built'), String(f)), 'utf8')))
    : []
  const candidate = buildCandidate({ plan: JSON.parse(fs.readFileSync(need('plan'), 'utf8')), built, commit: need('commit'), tree: need('tree') })
  fs.writeFileSync(need('out'), JSON.stringify(candidate, null, 2) + '\n')
  if (arg('summary')) fs.appendFileSync(arg('summary'), summaryTable(candidate))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
