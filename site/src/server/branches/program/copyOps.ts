/**
 * The commit helper's program, part 2: a branch's copy. Making one, committing in it, bringing its branch back to the
 * workspace's repository, renaming and deleting a branch, and removing a copy.
 *
 * A copy borrows the workspace's objects through a relative `objects/info/alternates` rather than hard links, so no
 * file of the workspace's repository is shared with a folder an agent writes. Committing reads the copy's working
 * tree and writes only into the copy; bringing back reads the copy (mounted read-only then) and writes, into the
 * workspace's repository, the copy's objects (each checked) and the one branch the site's record names.
 */
export const PROGRAM_COPY_OPS = String.raw`
function emptyFolder(root) {
  let st = null
  try { st = fs.lstatSync(root) } catch (e) { st = null }
  if (!st || st.isSymbolicLink() || !st.isDirectory() || fs.readdirSync(root).length) throw new Refusal('copy_exists')
}

function who(person, at) {
  return {
    GIT_AUTHOR_NAME: person.name, GIT_AUTHOR_EMAIL: person.email, GIT_AUTHOR_DATE: at,
    GIT_COMMITTER_NAME: person.name, GIT_COMMITTER_EMAIL: person.email, GIT_COMMITTER_DATE: at,
  }
}

function isAncestor(at, a, b) {
  return git(at, ['merge-base', '--is-ancestor', a, b], { allowFail: true }).status === 0
}

function mergeBaseOf(at, a, b) {
  const r = git(at, ['merge-base', a, b], { allowFail: true })
  return r.status === 0 ? text(r) : null
}

/** A new copy at \`R.copy\`, checked out on \`branch\` at \`tip\`, with \`main\` as \`origin\`'s. */
function makeCopy(R, q, branch, tip, main, mainTip) {
  emptyFolder(R.copy)
  git({ cwd: TMP }, ['init', '--template=', '-q', '-b', branch, R.copy])
  const cg = gitDirOf(R.copy, 'no_copy')
  const objects = path.join(cg, 'objects')
  fs.mkdirSync(path.join(objects, 'info'), { recursive: true })
  fs.writeFileSync(path.join(objects, 'info', 'alternates'), path.relative(objects, path.join(R.ws, '.git', 'objects')) + '\n')
  writeBranch(cg, branch, tip, null)
  const remote = walkTo(cg, 'refs/remotes/origin/' + main, true)
  fs.writeFileSync(remote, mainTip + '\n')
  if (typeof q.originUrl === 'string' && q.originUrl.startsWith('/')) {
    git({ cwd: TMP }, ['config', '--file', path.join(cg, 'config'), 'remote.origin.url', q.originUrl])
    git({ cwd: TMP }, ['config', '--file', path.join(cg, 'config'), 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'])
  }
  git(over(R.copy, { index: path.join(cg, 'index'), work: R.copy, cwd: R.copy }), ['read-tree', '--reset', '-u', tip])
}

function notMain(gd, ...names) {
  const main = mainOf(gd)
  for (const n of names) if (n === main) throw new Refusal('is_main')
  return main
}

function tipOf(gd, main) {
  const t = readBranch(gd, main)
  if (!t) throw new Refusal('not_repository', 'no commit on main')
  return t
}

Object.assign(ops, {
  create(q, R) {
    const wg = gitDirOf(R.ws)
    const main = notMain(wg, needBranch(q.branch))
    const mainTip = tipOf(wg, main)
    if (readBranch(wg, q.branch)) throw new Refusal('branch_exists')
    emptyFolder(R.copy)
    try { writeBranch(wg, q.branch, mainTip, null) } catch (e) { throw e.code === 'refConflict' || e.code === 'refMoved' ? new Refusal('branch_exists') : e }
    makeCopy(R, q, q.branch, mainTip, main, mainTip)
    return { head: mainTip, base: mainTip }
  },

  copy(q, R) {
    const wg = gitDirOf(R.ws)
    const main = notMain(wg, needBranch(q.branch))
    const mainTip = tipOf(wg, main)
    const tip = readBranch(wg, q.branch)
    if (!tip) throw new Refusal('not_found')
    makeCopy(R, q, q.branch, tip, main, mainTip)
    return { head: tip, base: mergeBaseOf(over(R.ws), mainTip, tip) || mainTip }
  },

  commit(q, R) {
    const cg = gitDirOf(R.copy, 'no_copy')
    const wg = gitDirOf(R.ws)
    notMain(wg, needBranch(q.branch))
    const before = readBranch(cg, q.branch)
    const tip = before || readBranch(wg, q.branch)
    if (!tip) throw new Refusal('not_found')
    const index = path.join(TMP, 'index-' + Date.now())
    const at = over(R.copy, { index, work: R.copy, cwd: R.copy })
    if (text(git(at, ['cat-file', '-t', tip], { failAs: 'not_found' })) !== 'commit') throw new Refusal('not_found')
    git(at, ['read-tree', tip])
    git(at, ['add', '-A', '--', '.'])
    const tree = text(git(at, ['write-tree']))
    // A merge from main under way (updateOps.ts) is finished by this commit, once no clashing file keeps its markers.
    const merging = mergeUnderWay(at, cg)
    if (merging) {
      const left = merging.paths.filter((p) => hasMarkers(at, tree, p))
      if (left.length) return { clashesLeft: left }
    } else if (tree === text(git(at, ['rev-parse', tip + '^{tree}']))) return { nothing: true }
    const files = String(git(at, ['diff-index', '--cached', '--no-renames', '--name-only', '-z', tip]).out).split('\0').filter(Boolean).length
    const parents = merging ? ['-p', tip, '-p', merging.head] : ['-p', tip]
    const commit = text(git(at, ['commit-tree', tree].concat(parents, ['-F', '-']), { env: who(q.author, q.at), input: q.message }))
    writeBranch(cg, q.branch, commit, before)
    setHead(cg, q.branch)
    if (merging) clearMerge(cg)
    const kept = path.join(cg, 'index.helper')
    fs.copyFileSync(index, kept)
    fs.renameSync(kept, path.join(cg, 'index'))
    return { commit, files }
  },

  bringBack(q, R) {
    const wg = gitDirOf(R.ws)
    const cg = gitDirOf(R.copy, 'no_copy')
    notMain(wg, needBranch(q.branch))
    const copyTip = readBranch(cg, q.branch)
    const wsTip = readBranch(wg, q.branch)
    if (!copyTip || copyTip === wsTip) {
      if (!wsTip) throw new Refusal('not_found')
      return { head: wsTip, previous: wsTip, moved: false, backup: null }
    }
    const src = cleanGitDir()
    fs.writeFileSync(path.join(src, 'objects', 'info', 'alternates'), path.resolve(cg, 'objects') + '\n')
    mirrorRefs(src, new Map([[q.branch, copyTip]]))
    const dest = over(R.ws)
    mirrorRefs(dest.dir, allBranches(wg))
    git(dest, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', src, 'refs/heads/' + q.branch + ':refs/fetched/branch'], { failAs: 'badObjects' })
    if (text(git(dest, ['cat-file', '-t', copyTip])) !== 'commit') throw new Refusal('badObjects')
    let backup = null
    if (wsTip && !isAncestor(dest, wsTip, copyTip)) {
      const taken = allBranches(wg)
      const stem = 'backup/' + q.branch + '-' + q.date
      backup = stem
      for (let n = 2; taken.has(backup); n++) backup = stem + '-' + n
      writeBranch(wg, needBranch(backup), wsTip, null)
    }
    writeBranch(wg, q.branch, copyTip, wsTip)
    return { head: copyTip, previous: wsTip, moved: true, backup }
  },

  rename(q, R) {
    const wg = gitDirOf(R.ws)
    notMain(wg, needBranch(q.from), needBranch(q.to))
    const tip = readBranch(wg, q.from)
    if (!tip) throw new Refusal('not_found')
    if (readBranch(wg, q.to)) throw new Refusal('branch_exists')
    try { writeBranch(wg, q.to, tip, null) } catch (e) { throw e.code === 'refConflict' ? new Refusal('branch_exists') : e }
    deleteBranch(wg, q.from, tip)
    if (R.copy) {
      const cg = gitDirOf(R.copy, 'no_copy')
      const ct = readBranch(cg, q.from)
      if (ct) {
        writeBranch(cg, q.to, ct, readBranch(cg, q.to))
        deleteBranch(cg, q.from, ct)
      }
      if (readRegular(path.join(cg, 'HEAD')) === 'ref: refs/heads/' + q.from + '\n') setHead(cg, q.to)
    }
    return { name: q.to }
  },

  delete(q, R) {
    const wg = gitDirOf(R.ws)
    const main = notMain(wg, needBranch(q.branch))
    const tip = readBranch(wg, q.branch)
    if (!tip) throw new Refusal('not_found')
    const others = [...allBranches(wg)].filter(([n]) => n !== q.branch).map(([, id]) => id)
    const at = over(R.ws)
    const lost = Number(text(git(at, ['rev-list', '--count', tip, '--not'].concat(others.length ? others : [tipOf(wg, main)]))))
    deleteBranch(wg, q.branch, tip)
    return { lostCommits: lost }
  },

  removeCopy(q, R) {
    for (const name of fs.readdirSync(R.copy)) fs.rmSync(path.join(R.copy, name), { recursive: true, force: true })
    return { removed: true }
  },
})
`
