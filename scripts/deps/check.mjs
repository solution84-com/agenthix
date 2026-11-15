// The rules that keep every package within what the others require of it. Plain Node, no dependencies.
//   node scripts/deps/check.mjs [<root>]
// Prints one line per failure (module, file, rule) and exits 1; prints nothing and exits 0 when every rule holds.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The only dependencies whose version in package.json is exact, by module, and why. Every other version is a range, so
 * a security or patch update can be taken without editing the file.
 */
export const ALLOWED_EXACT = {
  hq: {
    '@wasp.sh/wasp-cli': "Wasp's own version: the app is built against exactly one",
    prisma: "Wasp pins the Prisma it generates for, and hq's must match it",
    typescript: "Wasp pins the TypeScript its generated code is checked with, and hq's must match it",
  },
  site: {
    prisma: "the site's database client and its command line move together, and one version both",
    '@prisma/client': "the site's database client and its command line move together, and one version both",
  },
  'site/opencode-plugin': {
    '@opencode-ai/plugin': "built against the OpenCode the agent image installs, so it equals the image's OPENCODE_VERSION",
  },
}

// Packages that must resolve to one version in every module's lockfile.
const SAME_EVERYWHERE = ['typescript', 'esbuild', 'prisma']
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const SKIP_DIRS = new Set(['node_modules', '.git', '.wasp', 'dist', 'build', '.worktrees'])
const LEGACY = ['legacy', 'peer', 'deps'].join('-')
const EXACT = /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const rel = (root, file) => path.relative(root, file) || '.'

/** Every directory with a package.json: the root, each top-level module, the cross-app suite and site's OpenCode plugin. */
function modulesOf(root) {
  const dirs = [root]
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && !SKIP_DIRS.has(d.name) && !d.name.startsWith('.') && fs.existsSync(path.join(root, d.name, 'package.json'))) {
      dirs.push(path.join(root, d.name))
    }
  }
  for (const nested of [['tests', 'cross-app'], ['site', 'opencode-plugin']]) {
    const dir = path.join(root, ...nested)
    if (fs.existsSync(path.join(dir, 'package.json'))) dirs.push(dir)
  }
  return dirs.filter(d => fs.existsSync(path.join(d, 'package.json'))).map(dir => ({
    dir,
    name: dir === root ? 'root' : rel(root, dir),
  }))
}

function walk(dir, visit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, visit) } else visit(full)
  }
}

const installed = (lock, pkg) => lock.packages?.[`node_modules/${pkg}`]?.version
const major = v => String(v).split('.')[0]

function exactVersions(root, mods, fail) {
  for (const { dir, name } of mods) {
    const file = path.join(dir, 'package.json')
    const pkg = readJson(file)
    const allowed = ALLOWED_EXACT[name] ?? {}
    for (const section of SECTIONS) {
      for (const [dep, range] of Object.entries(pkg[section] ?? {})) {
        if (EXACT.test(String(range)) && !(dep in allowed)) {
          fail(name, rel(root, file), `${dep} is exact (${range}) and is not on the allowed list; use a range`)
        }
      }
    }
  }
}

function legacyPeerDeps(root, fail) {
  const target = f => {
    const base = path.basename(f)
    const r = rel(root, f)
    return base === '.npmrc' || /^Dockerfile/.test(base) || /\.Dockerfile$/.test(base)
      || r.startsWith(`.github${path.sep}workflows${path.sep}`) || r.startsWith(`scripts${path.sep}`)
  }
  const ownFiles = new Set([path.join('scripts', 'deps', 'check.mjs'), path.join('scripts', '__tests__', 'deps-check.test.mjs')])
  walk(root, f => {
    const r = rel(root, f)
    if (!target(f) || ownFiles.has(r)) return
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.includes(LEGACY) && !/^\s*(#|\/\/|;)/.test(line)) {
        const module = r.split(path.sep)[0] === r ? 'root' : r.split(path.sep)[0]
        fail(module, `${r}:${i + 1}`, `${LEGACY} is set; the install must resolve peer dependencies properly`)
      }
    })
  })
}

function sameVersions(root, mods, fail) {
  for (const pkg of SAME_EVERYWHERE) {
    const seen = {}
    for (const { dir, name } of mods) {
      const lockFile = path.join(dir, 'package-lock.json')
      if (!fs.existsSync(lockFile)) continue
      // Only where the module names it: a copy another package brings in is that package's choice.
      const own = readJson(path.join(dir, 'package.json'))
      if (!SECTIONS.some(section => own[section]?.[pkg])) continue
      const v = installed(readJson(lockFile), pkg)
      if (v) (seen[v] ??= []).push(name)
    }
    const versions = Object.keys(seen)
    if (versions.length > 1) {
      const detail = versions.map(v => `${v} in ${seen[v].join(', ')}`).join('; ')
      fail(seen[versions[0]][0], 'package-lock.json', `${pkg} is on more than one version: ${detail}`)
    }
  }
}

function typesNode(root, mods, fail) {
  const nvmrc = path.join(root, '.nvmrc')
  if (!fs.existsSync(nvmrc)) return
  const node = major(fs.readFileSync(nvmrc, 'utf8').trim().replace(/^v/, ''))
  for (const { dir, name } of mods) {
    const lockFile = path.join(dir, 'package-lock.json')
    if (!fs.existsSync(lockFile)) continue
    const v = installed(readJson(lockFile), '@types/node')
    if (v && major(v) !== node) fail(name, rel(root, lockFile), `@types/node is ${v} but .nvmrc is Node ${node}; the major must match`)
  }
}

function typescriptRange(root, mods, fail) {
  for (const { dir, name } of mods) {
    const file = path.join(dir, 'package.json')
    const pkg = readJson(file)
    for (const section of SECTIONS) {
      const range = pkg[section]?.typescript
      if (range === undefined) continue
      const exactAllowed = EXACT.test(range) && 'typescript' in (ALLOWED_EXACT[name] ?? {})
      if (!range.startsWith('~') && !exactAllowed) fail(name, rel(root, file), `typescript is "${range}"; its range must be patch-only (~)`)
    }
  }
}

const IMAGE_NAME = '[a-z0-9][a-z0-9._-]*(?:/[a-z0-9._-]+)*'
const OWN_IMAGE = /^agenthix-/

// Every outside image names a digest: on a FROM line, in a compose file's image:, and in a source string constant. Our
// own images, a FROM that names an earlier build stage, scratch, and an image set from a variable are exempt. A source
// string is read as an image only when its name is one the FROM lines and compose files already use and its tag is a
// version (so `node:crypto`, an import, is not one). Comments, tests and end-to-end recipes are not read.
function imagesPinned(root, fail) {
  const refs = []
  const sources = []
  walk(root, f => {
    const base = path.basename(f)
    const r = rel(root, f)
    const module = r.includes(path.sep) ? r.split(path.sep)[0] : 'root'
    const lines = () => fs.readFileSync(f, 'utf8').split('\n')
    if (/^([^/]*\.)?Dockerfile$/.test(base)) {
      const stages = new Set()
      lines().forEach((line, i) => {
        const m = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line)
        if (!m) return
        if (m[2]) stages.add(m[2])
        if (m[1] !== 'scratch' && !stages.has(m[1]) && !(m[2] && m[1] === m[2])) refs.push({ module, at: `${r}:${i + 1}`, ref: m[1] })
      })
    } else if (/^(docker-)?compose[^/]*\.ya?ml$/.test(base) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(r.split(path.sep).join('/'))) {
      lines().forEach((line, i) => {
        const m = /^\s*image:\s*['"]?([^\s'"#]+)/.exec(line)
        if (m && !m[1].includes('${')) refs.push({ module, at: `${r}:${i + 1}`, ref: m[1] })
      })
    } else if (/\.(ts|tsx|mjs|js|cjs)$/.test(base) && !/\.(test|spec)\./.test(base) && !r.split(path.sep).some(d => d === '__tests__' || d === 'e2e')) {
      sources.push({ module, r, f })
    }
  })
  const outside = refs.filter(({ ref }) => !OWN_IMAGE.test(ref.split('/').at(-1)))
  for (const { module, at, ref } of outside) {
    if (!ref.includes('@sha256:')) fail(module, at, `${ref} is not pinned by a digest`)
  }
  const names = new Set(outside.map(({ ref }) => ref.split('@')[0].replace(/:[^:/]*$/, '')))
  const constant = new RegExp(`(['"\`])(${IMAGE_NAME}):(\\d[\\w.-]*|latest)(@sha256:[0-9a-f]{64})?\\1`, 'g')
  for (const { module, r, f } of sources) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
      for (const m of line.matchAll(constant)) {
        if (names.has(m[2]) && !m[4]) fail(module, `${r}:${i + 1}`, `${m[2]}:${m[3]} is not pinned by a digest`)
      }
    })
  }
}

/** Every failure under `root`, as a line each. */
export function check(root) {
  const failures = []
  const fail = (module, file, rule) => failures.push(`${module}: ${file}: ${rule}`)
  const mods = modulesOf(root)
  exactVersions(root, mods, fail)
  legacyPeerDeps(root, fail)
  sameVersions(root, mods, fail)
  typesNode(root, mods, fail)
  typescriptRange(root, mods, fail)
  imagesPinned(root, fail)
  return failures
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'))
  const failures = check(root)
  for (const f of failures) console.log(f)
  process.exit(failures.length ? 1 : 0)
}
