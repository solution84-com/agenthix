/**
 * The commit helper's program, part 1: how it runs Git, and the ref store it keeps itself.
 *
 * **No repository's own settings are read.** Every `git` runs with `GIT_DIR` set to a fresh, empty Git folder in the
 * helper's `/tmp` with a settings file of our own, and reaches the repository's objects through
 * `GIT_OBJECT_DIRECTORY` and its working tree through `GIT_WORK_TREE`. So nothing in a repository's `.git/config`
 * (an `include.path`, a filter or merge driver, `core.fsmonitor`, `url.<x>.insteadOf`, `commit.gpgSign`), its
 * `hooks/`, its `info/attributes` or `info/grafts` ever reaches Git. Settings, global and system files are off, hooks
 * point at `/dev/null`, and objects arriving from a copy are checked (`transfer.fsckObjects`).
 *
 * **Refs are read and written here, as text**, in Git's own files layout (`refs/heads/…`, `packed-refs`), with the
 * lock file and the compare-and-swap Git uses, so moving a branch never needs Git to open the repository's own
 * folder. Branch names are checked before any path is made from them, and a link anywhere on a ref's path refuses.
 */
export const PROGRAM_CORE = String.raw`
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')

const GIT = process.env.TOOL_GIT || '/usr/bin/git'
const TMP = process.env.TOOL_TMP || '/tmp'
const DEADLINE = Number(process.env.TOOL_DEADLINE) || Date.now() + 85000
const MAX_OUT = 64 * 1024 * 1024
const SAFE = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.sshCommand=false', '-c', 'credential.helper=',
  '-c', 'core.attributesFile=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'core.askPass=false',
  '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.file.allow=always',
  '-c', 'transfer.fsckObjects=true', '-c', 'safe.directory=*', '-c', 'submodule.recurse=false', '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false', '-c', 'core.untrackedCache=false', '-c', 'commit.gpgSign=false',
  '-c', 'core.symlinks=true', '-c', 'core.protectNTFS=true', '-c', 'core.protectHFS=true', '-c', 'core.quotePath=false',
  '-c', 'push.followTags=false', '-c', 'advice.detachedHead=false', '-c', 'init.defaultBranch=main',
]
const PATH_ENV = process.env.TOOL_PATH || '/usr/bin:/bin'
/**
 * \`main\`'s objects, when the operation was given \`main\`. A copy borrows them through an \`alternates\` written for
 * where an agent's container has \`main\`, which is not where the helper has it, so every git over a copy is told
 * where they are here too.
 */
let MAIN_OBJECTS = null

class Refusal extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || '' } }

let scratchCount = 0
/** A Git folder of our own: no refs, no hooks, our settings only. */
function cleanGitDir() {
  const dir = fs.mkdtempSync(path.join(TMP, 'g' + (scratchCount++) + '-'))
  fs.mkdirSync(path.join(dir, 'refs', 'heads'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'objects', 'info'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'info'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'HEAD'), 'ref: refs/heads/.none\n')
  fs.writeFileSync(path.join(dir, 'config'), '[core]\n\trepositoryformatversion = 0\n\tbare = false\n')
  return dir
}

/** The environment one git runs with: \`at\` names its Git folder, objects, index and working tree. */
function gitEnv(at, extra) {
  const env = {
    PATH: PATH_ENV, HOME: TMP, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'false', SSH_ASKPASS: 'false', LANG: 'C', LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_ATTR_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null', GIT_LITERAL_PATHSPECS: '1', TZ: 'UTC',
  }
  if (at.dir) env.GIT_DIR = at.dir
  if (at.objects) env.GIT_OBJECT_DIRECTORY = at.objects
  if (MAIN_OBJECTS && at.objects && path.resolve(at.objects) !== path.resolve(MAIN_OBJECTS)) env.GIT_ALTERNATE_OBJECT_DIRECTORIES = MAIN_OBJECTS
  if (at.index) env.GIT_INDEX_FILE = at.index
  if (at.work) env.GIT_WORK_TREE = at.work
  return Object.assign(env, extra || {})
}

function git(at, args, opts) {
  opts = opts || {}
  const left = DEADLINE - Date.now()
  if (left <= 0) throw new Refusal('timedOut')
  const r = cp.spawnSync(GIT, SAFE.concat(args), {
    cwd: at.cwd || at.dir || TMP, env: gitEnv(at, opts.env), input: opts.input, maxBuffer: MAX_OUT, timeout: left,
  })
  if (r.error && r.error.code === 'ETIMEDOUT') throw new Refusal('timedOut')
  if (r.error) throw new Refusal('gitFailed', String(r.error.message))
  if (r.status !== 0 && !opts.allowFail) throw new Refusal(opts.failAs || 'gitFailed', String(r.stderr || '').slice(-2000))
  return { status: r.status, out: r.stdout, err: String(r.stderr || '') }
}
const text = (r) => String(r.out).trim()
const lines = (r) => String(r.out).split('\n').filter(Boolean)

// ── Names ────────────────────────────────────────────────────────────────
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
function isBranch(name) {
  if (typeof name !== 'string' || !name || name.length > 200) return false
  if (!/^[!-~]+$/.test(name) || /[~^:?*[\\\x7f]/.test(name)) return false
  if (name.startsWith('-') || name === 'HEAD' || name === '@') return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.')) return false
  return name.split('/').every((p) => !p.startsWith('.') && !p.endsWith('.lock'))
}
function needBranch(name) { if (!isBranch(name)) throw new Refusal('invalid'); return name }
function needCommitId(id) { if (typeof id !== 'string' || !COMMIT_ID.test(id)) throw new Refusal('invalid'); return id }

// ── The ref store ────────────────────────────────────────────────────────
/** A repository's \`.git\` folder: a real folder, never a link or a \`gitdir:\` file. */
function gitDirOf(root, code) {
  const gd = path.join(root, '.git')
  let st = null
  try { st = fs.lstatSync(gd) } catch (e) { st = null }
  if (!st || st.isSymbolicLink() || !st.isDirectory()) throw new Refusal(code || 'not_repository')
  return gd
}

/** Folders on the way to \`rel\` under \`base\`, made where missing when \`make\`; a link or a file on the way refuses. */
function walkTo(base, rel, make) {
  let at = base
  const parts = rel.split('/')
  for (const part of parts.slice(0, -1)) {
    at = path.join(at, part)
    let st
    try { st = fs.lstatSync(at) } catch (e) {
      if (e.code !== 'ENOENT' || !make) return null
      fs.mkdirSync(at)
      st = fs.lstatSync(at)
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Refusal('refConflict')
  }
  return path.join(base, rel)
}

function readRegular(abs) {
  let fd
  try { fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW) } catch (e) { return null }
  try { return fs.fstatSync(fd).isFile() ? fs.readFileSync(fd, 'utf8') : null } finally { fs.closeSync(fd) }
}

function packedRefs(gd) {
  const out = new Map()
  const raw = readRegular(path.join(gd, 'packed-refs'))
  if (!raw) return out
  for (const l of raw.split('\n')) {
    if (!l || l[0] === '#' || l[0] === '^') continue
    const sp = l.indexOf(' ')
    const id = l.slice(0, sp), name = l.slice(sp + 1)
    if (COMMIT_ID.test(id)) out.set(name, id)
  }
  return out
}

/** A branch's tip, or null. A loose ref wins over \`packed-refs\`, as in Git. */
function readBranch(gd, name) {
  needBranch(name)
  let abs = null
  try { abs = walkTo(gd, 'refs/heads/' + name, false) } catch (e) { abs = null }
  const loose = abs ? readRegular(abs) : null
  if (loose !== null) { const id = loose.trim(); return COMMIT_ID.test(id) ? id : null }
  return packedRefs(gd).get('refs/heads/' + name) || null
}

function looseBranches(gd, rel, out) {
  let entries
  try { entries = fs.readdirSync(path.join(gd, rel), { withFileTypes: true }) } catch (e) { return }
  for (const e of entries) {
    const r = rel + '/' + e.name
    if (e.isDirectory()) looseBranches(gd, r, out)
    else if (e.isFile() && !e.name.endsWith('.lock')) {
      const id = (readRegular(path.join(gd, r)) || '').trim()
      if (COMMIT_ID.test(id)) out.set(r, id)
    }
  }
}

/** Every branch with a valid name, name → tip. */
function allBranches(gd) {
  const refs = packedRefs(gd)
  looseBranches(gd, 'refs/heads', refs)
  const out = new Map()
  for (const [full, id] of refs) {
    if (!full.startsWith('refs/heads/')) continue
    const name = full.slice('refs/heads/'.length)
    if (isBranch(name)) out.set(name, id)
  }
  return out
}

/** The branch the folder has checked out: \`main\`, whatever it is called. */
function mainOf(gd) {
  const head = readRegular(path.join(gd, 'HEAD'))
  const m = head && /^ref: refs\/heads\/(.+)\n?$/.exec(head)
  if (!m || !isBranch(m[1])) throw new Refusal('not_repository', 'HEAD')
  return m[1]
}

function lockRef(abs) {
  try { return fs.openSync(abs + '.lock', 'wx', 0o644) } catch (e) {
    throw new Refusal(e.code === 'EEXIST' ? 'locked' : 'refConflict', e.code)
  }
}

/**
 * Moves a branch to \`id\` only when its tip is \`expected\` now: a commit id, or null for "must not exist". A name
 * whose folder is another branch, or under one, refuses.
 */
function writeBranch(gd, name, id, expected) {
  needBranch(name); needCommitId(id)
  const abs = walkTo(gd, 'refs/heads/' + name, true)
  let st = null
  try { st = fs.lstatSync(abs) } catch (e) { st = null }
  if (st && !st.isFile()) throw new Refusal('refConflict')
  const fd = lockRef(abs)
  try {
    const now = readBranch(gd, name)
    if (expected !== undefined && now !== expected) throw new Refusal('refMoved', String(now))
    fs.writeSync(fd, id + '\n')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fs.renameSync(abs + '.lock', abs)
  } catch (e) {
    try { fs.closeSync(fd) } catch (x) { /* already closed */ }
    try { fs.unlinkSync(abs + '.lock') } catch (x) { /* already gone */ }
    throw e
  }
}

function deleteBranch(gd, name, expected) {
  needBranch(name)
  const abs = walkTo(gd, 'refs/heads/' + name, false)
  if (!abs) throw new Refusal('not_found')
  const fd = lockRef(abs)
  try {
    if (readBranch(gd, name) !== expected) throw new Refusal('refMoved')
    try { fs.unlinkSync(abs) } catch (e) { if (e.code !== 'ENOENT') throw e }
    const packed = path.join(gd, 'packed-refs')
    const raw = readRegular(packed)
    if (raw && raw.split('\n').some((l) => l.endsWith(' refs/heads/' + name))) {
      const kept = []
      let skipPeel = false
      for (const l of raw.split('\n')) {
        if (skipPeel && l[0] === '^') continue
        skipPeel = l.endsWith(' refs/heads/' + name)
        if (!skipPeel) kept.push(l)
      }
      const pfd = lockRef(packed)
      fs.writeSync(pfd, kept.join('\n'))
      fs.closeSync(pfd)
      fs.renameSync(packed + '.lock', packed)
    }
  } finally {
    fs.closeSync(fd)
    try { fs.unlinkSync(abs + '.lock') } catch (x) { /* already gone */ }
  }
}

/** Points HEAD at \`name\`. The lock is written fresh: a link planted in its place is removed, never followed. */
function setHead(gd, name) {
  needBranch(name)
  const tmp = path.join(gd, 'HEAD.lock')
  try { fs.unlinkSync(tmp) } catch (e) { if (e.code !== 'ENOENT') throw new Refusal('refConflict') }
  fs.writeFileSync(tmp, 'ref: refs/heads/' + name + '\n', { flag: 'wx' })
  fs.renameSync(tmp, path.join(gd, 'HEAD'))
}

/** Keeps the index Git just wrote as the copy's own. The helper file is made fresh: a link planted under its name is removed, never followed. */
function keepIndex(cg, from) {
  const kept = path.join(cg, 'index.helper')
  try { fs.unlinkSync(kept) } catch (e) { if (e.code !== 'ENOENT') throw new Refusal('refConflict') }
  fs.copyFileSync(from, kept, fs.constants.COPYFILE_EXCL)
  fs.renameSync(kept, path.join(cg, 'index'))
}

/** A clean Git folder whose \`packed-refs\` mirrors \`branches\`, so Git can read them by name. */
function mirrorRefs(dir, branches) {
  const body = ['# pack-refs with: peeled fully-peeled sorted']
  for (const [name, id] of [...branches].sort((a, b) => (a[0] < b[0] ? -1 : 1))) body.push(id + ' refs/heads/' + name)
  fs.writeFileSync(path.join(dir, 'packed-refs'), body.join('\n') + '\n')
}

/** The \`alternates\` of a clean Git folder that reads \`objects\`: those, and \`main\`'s when given. */
function alternatesFor(objects) {
  const list = [path.resolve(objects)]
  if (MAIN_OBJECTS && path.resolve(MAIN_OBJECTS) !== list[0]) list.push(path.resolve(MAIN_OBJECTS))
  return list.join('\n') + '\n'
}

/**
 * The roots the site gave, checked: \`main\`'s objects noted, and a copy found in a boundary (\`within\`) still inside
 * it, whatever a run in that boundary did to the folders on the way.
 */
function useRoots(R) {
  MAIN_OBJECTS = R.ws ? path.join(R.ws, '.git', 'objects') : null
  if (R.within && R.copy) {
    let real = null
    try { real = fs.realpathSync(R.copy) } catch (e) { real = null }
    const within = fs.realpathSync(R.within)
    if (real && !real.startsWith(within + path.sep)) throw new Refusal('no_copy', 'the copy is not inside its boundary')
  }
  return R
}

/** The places one git works: a clean Git folder over the repository at \`root\`. */
function over(root, extra) {
  return Object.assign({ dir: cleanGitDir(), objects: path.join(root, '.git', 'objects') }, extra || {})
}
`
