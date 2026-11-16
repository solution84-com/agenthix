/**
 * The environment variables the host service reads from its own environment: its start-up settings, from `host.env`
 * (`--env-file` on its `docker run`) and the `docker run` itself. Found in the source rather than listed by hand, so a
 * setting read nowhere any more leaves the snapshot: `process.env.NAME`, and in a file that takes the process's
 * environment as a `NodeJS.ProcessEnv`, `env.NAME` and `env[NAME_VAR]` where `NAME_VAR` is a constant naming it, in the
 * host service or in core. Another container's environment, read from its compose file, is not the host service's.
 */
import fs from 'node:fs'
import path from 'node:path'

const HOST_SRC = path.resolve(import.meta.dirname, '../..')
const CORE_SRC = path.resolve(HOST_SRC, '../../core/src')

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : []
  })
}

/** Every `const NAME = 'TEXT'` or `const NAME = OTHER`, resolved to its text where it can be. */
function constants(texts: string[]): Map<string, string> {
  const literal = new Map<string, string>()
  const alias = new Map<string, string>()
  for (const text of texts) {
    for (const m of text.matchAll(/\bconst ([A-Z][A-Z0-9_]*) = '([^']*)'/g)) literal.set(m[1], m[2])
    for (const m of text.matchAll(/\bconst ([A-Z][A-Z0-9_]*) = ([A-Z][A-Z0-9_]*)\b(?!\s*[.([])/g)) alias.set(m[1], m[2])
  }
  for (const [name, other] of alias) if (literal.has(other)) literal.set(name, literal.get(other)!)
  return literal
}

export function settingsEntries(): string[] {
  const host = sources(HOST_SRC).map(f => fs.readFileSync(f, 'utf8'))
  const known = constants([...host, ...sources(CORE_SRC).map(f => fs.readFileSync(f, 'utf8'))])
  const names = new Set<string>()
  for (const text of host) {
    for (const m of text.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g)) names.add(m[1])
    if (!text.includes('NodeJS.ProcessEnv')) continue
    for (const m of text.matchAll(/(?<![.\w])env\??\.([A-Z][A-Z0-9_]*)\b/g)) names.add(m[1])
    for (const m of text.matchAll(/(?<![.\w])env\[([A-Z][A-Z0-9_]*)\]/g)) {
      const name = known.get(m[1])
      if (!name) throw new Error(`env[${m[1]}]: ${m[1]} names no setting this scan can read; give it a constant 'NAME'`)
      names.add(name)
    }
  }
  return [...names].sort()
}
