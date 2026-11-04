/**
 * The commit helper's program, part 3: what moves `main`, in the workspace's own repository. Turning Git on, a
 * squashed merge with a stored merge base, a restore, and pushing to and taking in from GitHub. Each checks `main` is
 * where the person saw it (`expectedMain`) before it changes anything, brings the workspace's folder to the new
 * version, and only then moves `main`, compare-and-swap.
 */
export const PROGRAM_MAIN_OPS = String.raw`
const LOG_FORMAT = '%x1e%H%x1f%s%x1f%an%x1f%ae%x1f%cI%x1f%(trailers:key=On-behalf-of,valueonly,separator=%x1d)'

function parseLog(out) {
  return String(out).split('\x1e').filter((s) => s.trim()).map((rec) => {
    const [id, subject, name, email, at, behalf] = rec.replace(/^\n+/, '').split('\x1f')
    const m = /^(.*\S)\s*<([^<>]+)>\s*$/.exec(String(behalf || '').split('\x1d')[0].trim())
    return {
      id: id.trim(), subject, author: { name, email }, at: String(at).trim(),
      onBehalfOf: m ? { name: m[1], email: m[2] } : null,
    }
  })
}

function versionNumber(at, commit) { return Number(text(git(at, ['rev-list', '--first-parent', '--count', commit]))) }

function filesChanged(at, commit) {
  const parent = git(at, ['rev-parse', '--verify', '-q', commit + '^1'], { allowFail: true })
  const args = parent.status === 0
    ? ['diff-tree', '-r', '-z', '--no-commit-id', '--name-only', text(parent), commit]
    : ['diff-tree', '-r', '-z', '--no-commit-id', '--name-only', '--root', commit]
  return String(git(at, args).out).split('\0').filter(Boolean).length
}

function versionOf(at, commit) {
  const l = parseLog(git(at, ['log', '-1', '--format=' + LOG_FORMAT, commit]).out)[0]
  return { number: versionNumber(at, commit), commit, subject: l.subject, author: l.author, files: filesChanged(at, commit), at: l.at }
}

/** The workspace's folder brought from \`from\` to \`to\`; a file changed there since refuses, and nothing moves. */
function updateFolder(R, gd, from, to) {
  const at = over(R.ws, { index: path.join(gd, 'index'), work: R.ws, cwd: R.ws })
  let hasIndex = false
  try { hasIndex = fs.lstatSync(path.join(gd, 'index')).isFile() } catch (e) { hasIndex = false }
  if (!hasIndex || !from) { git(at, ['read-tree', '--reset', '-u', to]); return }
  git(at, ['update-index', '-q', '--refresh'], { allowFail: true })
  git(at, ['read-tree', '-m', '-u', from, to], { failAs: 'folderChanged' })
}

function mainNow(gd, expected) {
  const main = mainOf(gd)
  const tip = readBranch(gd, main)
  if (!tip) throw new Refusal('not_repository', 'no commit on main')
  return { main, tip, moved: expected !== undefined && tip !== expected }
}

function escapeIgnore(p) {
  return '/' + p.replace(/[\\*?[\]]/g, (c) => '\\' + c).replace(/ $/, '\\ ')
}

function authEnv(token) {
  const basic = Buffer.from('x-access-token:' + token).toString('base64')
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + basic }
}

function needRemote(url) {
  if (typeof url !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+\/[!-~]+$/.test(url) || /@/.test(url)) throw new Refusal('invalid')
  return url
}

Object.assign(ops, {
  init(q, R) {
    let exists = true
    try { fs.lstatSync(path.join(R.ws, '.git')) } catch (e) { exists = false }
    if (exists) throw new Refusal('already_repository')
    let gitignoreAdded = false
    let hasIgnore = true
    try { fs.lstatSync(path.join(R.ws, '.gitignore')) } catch (e) { hasIgnore = false }
    git({ cwd: TMP }, ['init', '--template=', '-q', '-b', 'main', R.ws])
    const gd = gitDirOf(R.ws)
    const leftOut = []
    let at = null
    let commit = null
    // A failure partway (a file that cannot be read, say) takes back what this call made,
    // so the next try is not refused as already a repository.
    try {
      if (!hasIgnore) {
        fs.writeFileSync(path.join(R.ws, '.gitignore'), q.ignored.join('\n') + '\n', { flag: 'wx' })
        gitignoreAdded = true
      }
      at = over(R.ws, { index: path.join(gd, 'index'), work: R.ws, cwd: R.ws })
      for (const p of String(git(at, ['ls-files', '-z', '--others', '--exclude-standard']).out).split('\0').filter(Boolean)) {
        let st = null
        try { st = fs.lstatSync(path.join(R.ws, p)) } catch (e) { st = null }
        if (st && st.isFile() && st.size > q.large) leftOut.push({ path: p, bytes: st.size })
      }
      if (leftOut.length) fs.writeFileSync(path.join(at.dir, 'info', 'exclude'), leftOut.map((f) => escapeIgnore(f.path)).join('\n') + '\n')
      git(at, ['add', '-A', '--', '.'])
      const tree = text(git(at, ['write-tree']))
      commit = text(git(at, ['commit-tree', tree, '-F', '-'], { env: who(q.author, q.at), input: q.message }))
      writeBranch(gd, 'main', commit, null)
    } catch (e) {
      try { fs.rmSync(gd, { recursive: true, force: true }) } catch (e2) { /* the next try finds the folder as it is */ }
      if (gitignoreAdded) { try { fs.unlinkSync(path.join(R.ws, '.gitignore')) } catch (e2) { /* as above */ } }
      throw e
    }
    return { main: 'main', version: versionOf(at, commit), gitignoreAdded, leftOut }
  },

  merge(q, R) {
    const gd = gitDirOf(R.ws)
    const m = mainNow(gd, needCommitId(q.expectedMain))
    if (m.moved) return { moved: m.tip }
    notMain(gd, needBranch(q.branch))
    const tip = readBranch(gd, q.branch)
    if (!tip) throw new Refusal('not_found')
    const at = over(R.ws)
    const known = (id) => id && git(at, ['cat-file', '-e', id + '^{commit}'], { allowFail: true }).status === 0
    const base = q.base && known(q.base.mergedCommit) ? q.base.mergedCommit : mergeBaseOf(at, m.tip, tip)
    const sinceVersion = q.base && known(q.base.mergedVersion) ? q.base.mergedVersion : base
    const args = ['merge-tree', '--write-tree', '--name-only', '-z', '--no-messages']
    if (base) args.push('--merge-base=' + base)
    else args.push('--allow-unrelated-histories')
    const r = git(at, args.concat([m.tip, tip]), { allowFail: true })
    if (r.status !== 0 && r.status !== 1) throw new Refusal('gitFailed', r.err)
    const parts = String(r.out).split('\0')
    const tree = parts[0].trim()
    if (r.status === 1) {
      const names = [...new Set(parts.slice(1).filter(Boolean))]
      const clashes = names.map((p) => {
        const range = sinceVersion && isAncestor(at, sinceVersion, m.tip) ? [m.tip, '^' + sinceVersion] : [m.tip]
        const c = text(git(at, ['log', '--first-parent', '-1', '--format=%H'].concat(range, ['--', p])))
        return { path: p, version: c ? { number: versionNumber(at, c), commit: c, subject: parseLog(git(at, ['log', '-1', '--format=' + LOG_FORMAT, c]).out)[0].subject } : null }
      })
      return { clashes }
    }
    if (tree === text(git(at, ['rev-parse', m.tip + '^{tree}']))) return { nothing: true }
    const commit = text(git(at, ['commit-tree', tree, '-p', m.tip, '-F', '-'], { env: who(q.author, q.at), input: q.message }))
    updateFolder(R, gd, m.tip, commit)
    writeBranch(gd, m.main, commit, m.tip)
    return { version: versionOf(at, commit), mergedCommit: tip }
  },

  restore(q, R) {
    const gd = gitDirOf(R.ws)
    const m = mainNow(gd, needCommitId(q.expectedMain))
    if (m.moved) return { moved: m.tip }
    const at = over(R.ws)
    if (!lines(git(at, ['rev-list', '--first-parent', m.tip])).includes(needCommitId(q.version))) throw new Refusal('not_found')
    const tree = text(git(at, ['rev-parse', q.version + '^{tree}']))
    if (tree === text(git(at, ['rev-parse', m.tip + '^{tree}']))) return { same: true }
    const commit = text(git(at, ['commit-tree', tree, '-p', m.tip, '-F', '-'], { env: who(q.author, q.at), input: q.message }))
    updateFolder(R, gd, m.tip, commit)
    writeBranch(gd, m.main, commit, m.tip)
    return { version: versionOf(at, commit) }
  },

  pushMain(q, R) {
    const gd = gitDirOf(R.ws)
    const m = mainNow(gd)
    const at = over(R.ws)
    const r = git(at, ['push', '--porcelain', '--no-verify', '--no-follow-tags', '--recurse-submodules=no', '--', needRemote(q.url), m.tip + ':refs/heads/' + m.main], { env: authEnv(q.token), allowFail: true })
    if (r.status === 0) return { pushed: true, head: m.tip }
    if (/\[rejected\]|non-fast-forward|fetch first/.test(String(r.out) + r.err)) return { pushed: false }
    throw new Refusal('remoteFailed', r.err)
  },

  pullMain(q, R) {
    const gd = gitDirOf(R.ws)
    const m = mainNow(gd)
    const at = over(R.ws)
    mirrorRefs(at.dir, allBranches(gd))
    const r = git(at, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--', needRemote(q.url), 'refs/heads/' + m.main + ':refs/fetched/main'], { env: authEnv(q.token), allowFail: true })
    if (r.status !== 0) throw new Refusal('remoteFailed', r.err)
    const remote = (readRegular(path.join(at.dir, 'refs', 'fetched', 'main')) || '').trim()
    needCommitId(remote)
    if (remote === m.tip || isAncestor(at, remote, m.tip)) return { pulled: true, head: m.tip, versions: [] }
    if (!isAncestor(at, m.tip, remote)) return { diverged: true }
    const added = lines(git(at, ['rev-list', '--first-parent', '--reverse', remote, '^' + m.tip])).slice(-200)
    updateFolder(R, gd, m.tip, remote)
    writeBranch(gd, m.main, remote, m.tip)
    return { pulled: true, head: remote, versions: added.map((c) => versionOf(at, c)) }
  },
})
`
