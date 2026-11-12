#!/usr/bin/env node
// Makes a robots bundle from the owner's original pictures: a maintainer's step, run once per bundle, before the
// archive is published as the asset of a release tagged with the bundle's name. The archive is never committed.
//
//   node scripts/robots/pack.mjs --names <names.json> --out <folder> <source folder> [<source folder> ...]
//
// The names file says, in gallery order, which original becomes which name (robots-1.names.json beside this). Each
// original is looked for in the source folders in turn. Writes <folder>/<bundle>.tar.gz and prints its SHA-256,
// which goes into hq's pin (hq/src/pictures/robotsBundle.ts).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LICENSE, LICENSE_TEXT, MANIFEST, ROBOT_NAME, checkBundle, isWebp, sha256 } from './bundle.mjs'
import { packTar } from './tar.mjs'

/** Reads the originals and returns the archive's bytes. */
export function packBundle(names, sourceDirs) {
  if (typeof names.bundle !== 'string' || !ROBOT_NAME.test(names.bundle) || !Number.isInteger(names.version)) {
    throw new Error('The names file needs a bundle name and an integer version')
  }
  const entries = []
  const robots = []
  for (const { source, name } of names.robots) {
    if (!ROBOT_NAME.test(name)) throw new Error(`Not a robot name: ${JSON.stringify(name)}`)
    if (path.basename(source) !== source) throw new Error(`An original is named by its file name alone: ${source}`)
    const dir = sourceDirs.find((d) => fs.existsSync(path.join(d, source)))
    if (!dir) throw new Error(`${source} is in none of ${sourceDirs.join(', ')}`)
    const data = fs.readFileSync(path.join(dir, source))
    if (!isWebp(data)) throw new Error(`${source} is not a WebP picture`)
    entries.push({ name: `${name}.webp`, data })
    robots.push({ name, file: `${name}.webp`, sha256: sha256(data), bytes: data.length })
  }
  const manifest = { bundle: names.bundle, version: names.version, robots }
  entries.push({ name: MANIFEST, data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) })
  entries.push({ name: LICENSE, data: Buffer.from(LICENSE_TEXT) })
  checkBundle(new Map(entries.map((e) => [e.name, e.data])), names)
  return packTar(entries)
}

function main(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag)
    return i === -1 ? undefined : argv.splice(i, 2)[1]
  }
  const namesFile = at('--names')
  const out = at('--out')
  if (!namesFile || !out || argv.length === 0) {
    console.error('Usage: node scripts/robots/pack.mjs --names <names.json> --out <folder> <source folder> [...]')
    process.exit(2)
  }
  const names = JSON.parse(fs.readFileSync(namesFile, 'utf8'))
  const archive = packBundle(names, argv.map((d) => path.resolve(d)))
  fs.mkdirSync(out, { recursive: true })
  const file = path.join(path.resolve(out), `${names.bundle}.tar.gz`)
  fs.writeFileSync(file, archive)
  console.log(`${file}\n${archive.length} bytes\nsha256 ${sha256(archive)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
