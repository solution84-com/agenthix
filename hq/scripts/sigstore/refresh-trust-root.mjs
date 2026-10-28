#!/usr/bin/env node
// Refreshes Sigstore's trust root that hq's image carries, so hq checks package signatures offline (adr-0158).
// Run at each release, before the images are built:
//
//   npm run sigstore:refresh          # in hq/
//
// It fetches `trusted_root.json` from Sigstore's public TUF repository through @sigstore/tuf, which checks the
// repository's signed metadata from the root it embeds, and writes the file byte for byte as TUF served it.
// Beside it, `issued.json` records when it was fetched (the root's issue date, which hq reports and from which it
// counts the root's age), where from and the file's sha256.

import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_MIRROR_URL, initTUF } from '@sigstore/tuf'

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'sigstore')
const cachePath = await mkdtemp(join(tmpdir(), 'sigstore-tuf-'))
try {
  const tuf = await initTUF({ mirrorURL: DEFAULT_MIRROR_URL, cachePath, force: true })
  const root = await tuf.getTarget('trusted_root.json')
  const parsed = JSON.parse(root)
  if (!Array.isArray(parsed.tlogs) || !Array.isArray(parsed.certificateAuthorities)) {
    throw new Error('the trusted root from Sigstore has no transparency logs or certificate authorities')
  }
  const issued = {
    issuedAt: new Date().toISOString(),
    source: `${DEFAULT_MIRROR_URL}/targets/trusted_root.json`,
    sha256: createHash('sha256').update(root).digest('hex'),
  }
  await writeFile(join(outDir, 'trusted_root.json'), root)
  await writeFile(join(outDir, 'issued.json'), JSON.stringify(issued, null, 2) + '\n')
  console.log(`Wrote ${join(outDir, 'trusted_root.json')} (sha256 ${issued.sha256}), issued ${issued.issuedAt}`)
} finally {
  await rm(cachePath, { recursive: true, force: true })
}
