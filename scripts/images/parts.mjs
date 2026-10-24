#!/usr/bin/env node
// The image parts, from scripts/images/parts.json: node scripts/images/parts.mjs prints one line per part,
// `<part> <Dockerfile> <target>` (`-` for a part built to the Dockerfile's last stage), for the scripts that loop.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PARTS_FILE = 'scripts/images/parts.json'

export const parsePartsFile = text => {
  const { rebuildEpoch, parts } = JSON.parse(text)
  if (!Number.isInteger(rebuildEpoch)) throw new Error(`${PARTS_FILE}: rebuildEpoch must be a whole number.`)
  return { rebuildEpoch, parts }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const { parts } = parsePartsFile(fs.readFileSync(path.join(root, PARTS_FILE), 'utf8'))
  for (const [part, p] of Object.entries(parts)) console.log(`${part} ${p.dockerfile} ${p.target ?? '-'}`)
}
