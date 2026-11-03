#!/usr/bin/env node
// A released flag lives for one minor release (adr-0172). Refuses a version while a flag released in an earlier minor
// or major release is still in core's list:
//   node scripts/release/flags-overdue.mjs <version>        (0.3.0, v0.3.0, 0.3.0-rc.1)
// Reads core's built output, so core is built first (cd core && npm run build). Exit 0: none overdue. Exit 1: each
// overdue flag named, with what to do. Exit 2: not a version.
import { flagsOverdue } from '../../core/dist/shared/featureFlagReleases.js'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/release/flags-overdue.mjs <version>')
  process.exit(2)
}

let overdue
try {
  overdue = flagsOverdue(version)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
}

if (overdue.length > 0) {
  console.error(
    `Cannot release ${version}: these flags were released in an earlier minor release and must be removed first, ` +
      `with their features left on: ${overdue.join(', ')}. Remove each from core/src/shared/featureFlags.ts; the ` +
      'compiler then lists every gate and test to remove.',
  )
  process.exit(1)
}
console.log(`No released flag outlives its minor release at ${version}.`)
