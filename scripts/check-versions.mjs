// The product has one version, the root package.json's, and every module carries it. A release is cut by changing
// every package.json (and its lock file) to the new version, so one that was missed fails here rather than shipping.
//   node scripts/check-versions.mjs            every module agrees with the root
//   node scripts/check-versions.mjs 1.0.0-alpha.3   ... and the root equals this version (the release tag's)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modules = ['.', 'core', 'ui', 'hq', 'site', 'site/opencode-plugin', 'host', 'console', 'console-web', 'tests/cross-app']
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

const expected = process.argv[2] ?? read('package.json').version
const problems = []
if (!expected) problems.push('The root package.json has no version.')
for (const dir of modules) {
  const pkg = `${dir}/package.json`
  const lock = `${dir}/package-lock.json`
  const found = read(pkg).version
  if (found !== expected) problems.push(`${pkg} is at ${found ?? 'no version'}, not ${expected}.`)
  const locked = read(lock)
  if (locked.version !== expected || locked.packages?.['']?.version !== expected) {
    problems.push(`${lock} is at ${locked.version ?? 'no version'} (package entry ${locked.packages?.['']?.version ?? 'none'}), not ${expected}.`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`\nSet "version" to ${expected} in each file above (package.json and package-lock.json together), then commit.`)
  process.exit(1)
}
console.log(`Every module is at ${expected}.`)
