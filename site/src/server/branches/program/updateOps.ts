/**
 * The commit helper's program, part 5: bringing `main` into a branch's copy, for the agent's `update_from_main` tool.
 * It reads the workspace's repository (mounted read-only then) and writes only into the copy.
 *
 * - A copy with changes not committed is left alone, as is one whose earlier merge still waits for its commit.
 * - When the branch has all of `main`, nothing happens; when it has nothing of its own, it moves to `main`.
 * - Otherwise `git merge-tree` merges them. A clean merge is committed with both parents. On clashes the merged
 *   files, conflict markers and all, are written into the copy's working folder, and the merge is recorded as Git
 *   records one under way: `MERGE_HEAD` (main's tip) and `MERGE_MSG` (with a `# Conflicts:` line per file), so the
 *   copy's next commit, by the tool or the agent's own `git`, is the merge commit.
 *
 * The record is in the copy's `.git`, which the agent writes: it is read as hostile like everything there. A merge
 * head that is not a commit is dropped, and the paths are only ever looked up in a tree, never opened on disk.
 */
export const PROGRAM_UPDATE_OPS = String.raw`
/** Replaces a file of the copy's Git folder; a link planted in its place is removed, never followed. */
function writeOwn(abs, body) {
  try { fs.unlinkSync(abs) } catch (e) { if (e.code !== 'ENOENT') throw new Refusal('refConflict') }
  fs.writeFileSync(abs, body, { flag: 'wx' })
}

function isRepoPathLike(p) {
  return typeof p === 'string' && p.length > 0 && p.length <= 4096 && !p.includes('\0') && !p.startsWith('/')
}

/** The merge under way in a copy, or null: main's tip it merges, and the files that clashed. */
function mergeUnderWay(at, cg) {
  const head = (readRegular(path.join(cg, 'MERGE_HEAD')) || '').trim().split('\n')[0]
  if (!head) return null
  if (!COMMIT_ID.test(head) || git(at, ['cat-file', '-t', head], { allowFail: true }).out.toString().trim() !== 'commit') {
    clearMerge(cg)
    return null
  }
  const msg = readRegular(path.join(cg, 'MERGE_MSG')) || ''
  const paths = msg.split('\n').filter((l) => l.startsWith('#\t')).map((l) => l.slice(2)).filter(isRepoPathLike)
  return { head, paths }
}

function clearMerge(cg) {
  for (const f of ['MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE']) fs.rmSync(path.join(cg, f), { force: true })
}

/** Whether a file of \`tree\` still holds Git's conflict markers. */
function hasMarkers(at, tree, p) {
  const r = git(at, ['cat-file', 'blob', tree + ':' + p], { allowFail: true })
  if (r.status !== 0) return false
  const body = String(r.out)
  return /^<{7}(?: |$)/m.test(body) && /^>{7}(?: |$)/m.test(body)
}

/** The copy's working folder and its index brought from \`from\` to \`to\`, the index kept as Git's own. */
function checkOut(R, cg, at, from, to) {
  git(at, ['read-tree', '-m', '-u', from, to])
  keepIndex(cg, at.index)
}

/** The one branch under the copy's \`refs/remotes/origin\`: main, as a bundle brought it; none or several refuses. */
function originMain(cg, branch) {
  let names = []
  try { names = fs.readdirSync(path.join(cg, 'refs', 'remotes', 'origin')) } catch (e) { names = [] }
  const found = names.filter((n) => isBranch(n) && n !== branch)
  if (found.length !== 1) throw new Refusal('not_found', 'no single main in the copy')
  return found[0]
}

function originTip(cg, main) {
  const abs = walkTo(cg, 'refs/remotes/origin/' + main, false)
  const id = ((abs && readRegular(abs)) || '').trim()
  if (!COMMIT_ID.test(id)) throw new Refusal('not_found', 'no main in the copy')
  return id
}

Object.assign(ops, {
  updateFromMain(q, R) {
    const cg = gitDirOf(R.copy, 'no_copy')
    // A live preview's own copy on another site has no workspace beside it: main is what its bundle carried, kept as
    // origin's main in the copy.
    const wg = R.ws ? gitDirOf(R.ws) : null
    const main = wg ? notMain(wg, needBranch(q.branch)) : originMain(cg, needBranch(q.branch))
    const mainTip = wg ? tipOf(wg, main) : originTip(cg, main)
    const index = path.join(TMP, 'index-u-' + Date.now())
    const at = over(R.copy, { index, work: R.copy, cwd: R.copy })
    const under = mergeUnderWay(at, cg)
    if (under) return { mergeUnderWay: under.paths }
    const before = readBranch(cg, q.branch)
    const tip = before || (wg ? readBranch(wg, q.branch) : null)
    if (!tip) throw new Refusal('not_found')
    if (text(git(at, ['cat-file', '-t', tip], { failAs: 'not_found' })) !== 'commit') throw new Refusal('not_found')
    git(at, ['read-tree', tip])
    git(at, ['add', '-A', '--', '.'])
    if (text(git(at, ['write-tree'])) !== text(git(at, ['rev-parse', tip + '^{tree}']))) return { uncommitted: true }
    writeOwn(walkTo(cg, 'refs/remotes/origin/' + main, true), mainTip + '\n')
    if (isAncestor(at, mainTip, tip)) return { upToDate: tip }

    if (isAncestor(at, tip, mainTip)) {
      checkOut(R, cg, at, tip, mainTip)
      writeBranch(cg, q.branch, mainTip, before)
      setHead(cg, q.branch)
      return { commit: mainTip, fastForward: true }
    }

    const r = git(at, ['merge-tree', '--write-tree', '--name-only', '-z', '--no-messages', tip, mainTip], { allowFail: true })
    if (r.status !== 0 && r.status !== 1) throw new Refusal('gitFailed', r.err)
    const parts = String(r.out).split('\0')
    const merged = parts[0].trim()
    if (r.status === 0) {
      const commit = text(git(at, ['commit-tree', merged, '-p', tip, '-p', mainTip, '-F', '-'], { env: who(q.author, q.at), input: q.message }))
      checkOut(R, cg, at, tip, commit)
      writeBranch(cg, q.branch, commit, before)
      setHead(cg, q.branch)
      return { commit, fastForward: false }
    }
    const paths = [...new Set(parts.slice(1).filter(Boolean))]
    checkOut(R, cg, at, tip, merged)
    writeOwn(path.join(cg, 'MERGE_HEAD'), mainTip + '\n')
    writeOwn(path.join(cg, 'MERGE_MSG'), q.message.trimEnd() + '\n\n# Conflicts:\n' + paths.map((p) => '#\t' + p + '\n').join(''))
    return { clashes: paths, mainTip }
  },
})
`
