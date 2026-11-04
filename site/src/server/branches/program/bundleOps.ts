/**
 * The commit helper's program, part 6: live previews' own copies and Git bundles (live preview spec sections 4 and 5).
 *
 * - `mainCopy`, `refreshMain`: `main`'s live preview runs from a copy of its own, outside every storage. It holds
 *   `main`'s objects itself rather than borrowing the workspace's, so the app's container binds it alone.
 * - `bundleMake`: a bundle of a branch (with `main` beside it), of `main`, or of a live preview's own copy, written
 *   to the folder the site gave for it, holding only what comes after the prerequisites that are there.
 * - `bundleCopy`, `bundleRefresh`: a live preview's own copy on another site, made from a bundle and brought up to a
 *   later one.
 * - `bringBackBundle`: a branch's new commits from a bundle, into the workspace's repository: only that branch's name
 *   is written, only when it is where hq says, and a history that does not follow on is kept first as a backup branch.
 * - `copyCommit`, `copyHead`: the `commit` tool and the head read for a live preview's own copy, which has no
 *   workspace beside it on its site.
 *
 * Nothing of a bundle is trusted but its commits: it is read with the program's own Git folder, every object is
 * checked as it arrives, and only the refs named are taken from it.
 */
export const PROGRAM_BUNDLE_OPS = String.raw`
/** A fresh repository at \`root\` on \`branch\`, holding its objects itself. */
function initOwn(root, branch) {
  emptyFolder(root)
  git({ cwd: TMP }, ['init', '--template=', '-q', '-b', branch, root])
  return gitDirOf(root, 'no_copy')
}

/** Fetches \`refs\` (name → name) from \`source\` (a repository path or a bundle file) into the objects of \`root\`. */
function fetchInto(root, source, refs, failAs) {
  const at = over(root)
  const specs = refs.map((r) => 'refs/heads/' + r + ':refs/fetched/' + r)
  git(at, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', source].concat(specs), { failAs: failAs || 'badObjects' })
  const out = new Map()
  for (const r of refs) {
    const id = text(git(at, ['rev-parse', '--verify', '-q', 'refs/fetched/' + r + '^{commit}'], { allowFail: true }))
    if (COMMIT_ID.test(id)) out.set(r, id)
  }
  return out
}

/** A clean Git folder over \`root\`'s objects with \`branches\` as its refs, to fetch from by name. */
function sourceOf(root, branches) {
  const src = cleanGitDir()
  fs.writeFileSync(path.join(src, 'objects', 'info', 'alternates'), alternatesFor(path.join(root, '.git', 'objects')))
  mirrorRefs(src, branches)
  return src
}

/** The copy's working folder and index set to \`to\`, from \`from\` (null for an empty one); untracked files stay. */
function setTree(root, cg, from, to) {
  const index = path.join(TMP, 'index-b-' + Date.now() + '-' + (scratchCount++))
  const at = over(root, { index, work: root, cwd: root })
  if (from) git(at, ['read-tree', from])
  git(at, ['read-tree', '--reset', '-u', to])
  keepIndex(cg, index)
}

/** A bundle file the helper was given: a real file, never a link. */
function bundleFile(R) {
  const f = R.bundle
  let st = null
  try { st = fs.lstatSync(f) } catch (e) { st = null }
  if (!st || !st.isFile()) throw new Refusal('noBundle')
  return f
}

/** The branches a bundle holds, by name, as it lists them. */
function bundleHeads(root, file) {
  const out = []
  for (const l of lines(git(over(root), ['bundle', 'list-heads', file], { failAs: 'noBundle' }))) {
    const m = /^([0-9a-f]{40}|[0-9a-f]{64}) refs\/heads\/(.+)$/.exec(l)
    if (m && isBranch(m[2])) out.push(m[2])
  }
  return out
}

function needPrereqs(at, list) {
  if (!Array.isArray(list)) throw new Refusal('invalid')
  return list.map(needCommitId).filter((c) => git(at, ['cat-file', '-e', c + '^{commit}'], { allowFail: true }).status === 0)
}

Object.assign(ops, {
  mainCopy(q, R) {
    const wg = gitDirOf(R.ws)
    const main = mainOf(wg)
    const tip = tipOf(wg, main)
    const cg = initOwn(R.copy, main)
    const got = fetchInto(R.copy, sourceOf(R.ws, new Map([[main, tip]])), [main])
    if (got.get(main) !== tip) throw new Refusal('badObjects')
    writeBranch(cg, main, tip, null)
    setHead(cg, main)
    setTree(R.copy, cg, null, tip)
    return { head: tip, main }
  },

  refreshMain(q, R) {
    const wg = gitDirOf(R.ws)
    const cg = gitDirOf(R.copy, 'no_copy')
    const main = mainOf(wg)
    const tip = tipOf(wg, main)
    if (needCommitId(q.head) !== tip) throw new Refusal('not_found', 'main is not at the head named')
    const before = readBranch(cg, main)
    if (before === tip) return { head: tip }
    const got = fetchInto(R.copy, sourceOf(R.ws, new Map([[main, tip]])), [main])
    if (got.get(main) !== tip) throw new Refusal('badObjects')
    writeBranch(cg, main, tip, before)
    setHead(cg, main)
    setTree(R.copy, cg, before, tip)
    return { head: tip }
  },

  bundleMake(q, R) {
    let root, refs, head
    if (q.kind === 'livePreview') {
      root = R.copy
      const cg = gitDirOf(root, 'no_copy')
      head = readBranch(cg, needBranch(q.branch))
      if (!head) throw new Refusal('not_found')
      refs = new Map([[q.branch, head]])
    } else {
      root = R.ws
      const wg = gitDirOf(root)
      const main = mainOf(wg)
      const mainTip = tipOf(wg, main)
      if (q.kind === 'main') {
        head = mainTip
        refs = new Map([[main, mainTip]])
      } else {
        const branch = needBranch(q.branch)
        if (branch === main) throw new Refusal('is_main')
        head = readBranch(wg, branch)
        if (!head) throw new Refusal('not_found')
        refs = new Map([[branch, head], [main, mainTip]])
      }
    }
    const at = over(root)
    mirrorRefs(at.dir, refs)
    const not = needPrereqs(at, q.prerequisites)
    const fresh = Number(text(git(at, ['rev-list', '--count'].concat([...refs.values()], not.length ? ['--not'].concat(not) : []))))
    if (fresh === 0) return { nothing: true, head }
    const out = path.join(R.out, 'bundle')
    git(at, ['bundle', 'create', '--quiet', out].concat([...refs.keys()].map((r) => 'refs/heads/' + r), not.map((c) => '^' + c)))
    return { head }
  },

  bundleCopy(q, R) {
    const branch = needBranch(q.branch)
    const cg = initOwn(R.copy, branch)
    const file = bundleFile(R)
    const main = bundleHeads(R.copy, file).find((h) => h !== branch) || null
    const wanted = main && main !== branch ? [branch, main] : [branch]
    const got = fetchInto(R.copy, file, wanted)
    const tip = got.get(branch)
    if (!tip) throw new Refusal('not_found')
    writeBranch(cg, branch, tip, null)
    if (main && main !== branch && got.get(main)) fs.writeFileSync(walkTo(cg, 'refs/remotes/origin/' + main, true), got.get(main) + '\n')
    setHead(cg, branch)
    setTree(R.copy, cg, null, tip)
    return { head: tip }
  },

  bundleRefresh(q, R) {
    const cg = gitDirOf(R.copy, 'no_copy')
    const file = bundleFile(R)
    const branch = needBranch(q.branch)
    const name = q.onMain ? branch : bundleHeads(R.copy, file).find((h) => h !== branch)
    if (!name) throw new Refusal('noBundle', 'the bundle holds no main')
    const head = needCommitId(q.head)
    const got = fetchInto(R.copy, file, [name])
    if (got.get(name) !== head) throw new Refusal('not_found', 'the bundle does not hold the head named')
    if (q.onMain) {
      const before = readBranch(cg, name)
      if (before !== head) {
        writeBranch(cg, name, head, before)
        setHead(cg, name)
        setTree(R.copy, cg, before, head)
      }
    } else {
      fs.writeFileSync(walkTo(cg, 'refs/remotes/origin/' + name, true), head + '\n')
    }
    return { head }
  },

  bringBackBundle(q, R) {
    const wg = gitDirOf(R.ws)
    notMain(wg, needBranch(q.branch))
    const now = readBranch(wg, q.branch)
    const expected = q.expectedPrevious === null ? null : needCommitId(q.expectedPrevious)
    if (now !== expected) return { movedMeanwhile: true, head: now }
    const got = fetchInto(R.ws, bundleFile(R), [q.branch])
    const tip = got.get(q.branch)
    if (!tip) throw new Refusal('badObjects')
    if (tip === now) return { head: now, previous: now, moved: false, backup: null }
    const dest = over(R.ws)
    mirrorRefs(dest.dir, allBranches(wg))
    let backup = null
    if (now && !isAncestor(dest, now, tip)) {
      const taken = allBranches(wg)
      const stem = 'backup/' + q.branch + '-' + q.date
      backup = stem
      for (let n = 2; taken.has(backup); n++) backup = stem + '-' + n
      writeBranch(wg, needBranch(backup), now, null)
    }
    writeBranch(wg, q.branch, tip, now)
    return { head: tip, previous: now, moved: true, backup }
  },

  copyCommit(q, R) {
    const cg = gitDirOf(R.copy, 'no_copy')
    const branch = needBranch(q.branch)
    const tip = readBranch(cg, branch)
    if (!tip) throw new Refusal('not_found')
    const index = path.join(TMP, 'index-c-' + Date.now())
    const at = over(R.copy, { index, work: R.copy, cwd: R.copy })
    if (text(git(at, ['cat-file', '-t', tip], { failAs: 'not_found' })) !== 'commit') throw new Refusal('not_found')
    git(at, ['read-tree', tip])
    git(at, ['add', '-A', '--', '.'])
    const tree = text(git(at, ['write-tree']))
    if (tree === text(git(at, ['rev-parse', tip + '^{tree}']))) return { nothing: true, head: tip }
    const files = String(git(at, ['diff-index', '--cached', '--no-renames', '--name-only', '-z', tip]).out).split('\0').filter(Boolean).length
    const commit = text(git(at, ['commit-tree', tree, '-p', tip, '-F', '-'], { env: who(q.author, q.at), input: q.message }))
    writeBranch(cg, branch, commit, tip)
    setHead(cg, branch)
    keepIndex(cg, index)
    return { commit, files }
  },

  copyHead(q, R) {
    const cg = gitDirOf(R.copy, 'no_copy')
    const head = readBranch(cg, needBranch(q.branch))
    if (!head) throw new Refusal('not_found')
    return { head }
  },
})
`
