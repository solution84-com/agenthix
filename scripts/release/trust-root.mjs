#!/usr/bin/env node
// Checks that the Sigstore trust root hq's image carries is fresh enough to ship, for the release rehearsal:
//   node scripts/release/trust-root.mjs [<directory holding trusted_root.json and issued.json>]
// hq refuses a signature check against a root fetched more than 365 days ago (TRUST_ROOT_MAX_AGE_DAYS in
// hq/src/assets/signing/trustRoot.ts), and an image keeps being used long after its release, so a release must not
// carry a root already close to that. This fails past MAX_AGE_DAYS, or when the root is not the file `issued.json`
// describes. It only reads: the refresh (`npm run sigstore:refresh` in hq/) changes files, and is run and committed
// by a person before the release, never by the rehearsal.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_AGE_DAYS = 300
const DAY = 86_400_000

/** The problem with a trust root, as a sentence, or null when it can ship. */
export function trustRootProblem({ rootText, issuedText, now }) {
  let issued
  try { issued = JSON.parse(issuedText) } catch { return 'issued.json is not readable JSON.' }
  const issuedAt = typeof issued?.issuedAt === 'string' ? Date.parse(issued.issuedAt) : NaN
  if (Number.isNaN(issuedAt)) return 'issued.json has no valid issuedAt.'
  const sha = createHash('sha256').update(rootText).digest('hex')
  if (sha !== issued.sha256) return 'trusted_root.json is not the file issued.json describes (its sha256 differs).'
  const days = Math.floor((now - issuedAt) / DAY)
  if (days < 0) return `the trust root's issue date is ${-days} days in the future.`
  if (days > MAX_AGE_DAYS) return `the trust root was fetched ${days} days ago; a release may carry one at most ${MAX_AGE_DAYS} days old.`
  return null
}

function main() {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hq', 'assets', 'sigstore'))
  let problem
  try {
    problem = trustRootProblem({
      rootText: fs.readFileSync(path.join(dir, 'trusted_root.json'), 'utf8'),
      issuedText: fs.readFileSync(path.join(dir, 'issued.json'), 'utf8'),
      now: Date.now(),
    })
  } catch (e) { problem = `${e.message}` }
  if (problem) {
    console.error(`Sigstore trust root: ${problem}\nRun "npm run sigstore:refresh" in hq/ and commit hq/assets/sigstore/, then run the rehearsal again. Nothing was changed.`)
    process.exit(1)
  }
  console.log(`Sigstore trust root in ${dir} is fresh enough to ship.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
