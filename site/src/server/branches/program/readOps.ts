/**
 * The commit helper's program, part 4: the reads the workspace view is drawn from, all from the workspace's own
 * repository (mounted read-only for them). Refs are handed to Git as a mirror in a clean Git folder, so it reads them
 * by name without opening the repository's own.
 */
export const PROGRAM_READ_OPS = String.raw`
function reading(R) {
  const gd = gitDirOf(R.ws)
  const branches = allBranches(gd)
  const at = over(R.ws)
  mirrorRefs(at.dir, branches)
  const main = mainOf(gd)
  const mainTip = branches.get(main)
  if (!mainTip) throw new Refusal('not_repository', 'no commit on main')
  return { gd, at, branches, main, mainTip }
}

function revOf(s, rev) {
  if (rev && typeof rev.commit === 'string') {
    needCommitId(rev.commit)
    if (git(s.at, ['cat-file', '-e', rev.commit + '^{commit}'], { allowFail: true }).status !== 0) throw new Refusal('not_found')
    return rev.commit
  }
  const tip = s.branches.get(needBranch(rev && rev.branch))
  if (!tip) throw new Refusal('not_found')
  return tip
}

function lineOf(l) { return { id: l.id, subject: l.subject, author: l.author, onBehalfOf: l.onBehalfOf, at: l.at } }

/** What a branch's changes are counted from: its last merge, or where it left \`main\`; the empty tree when neither. */
function baseOf(s, tip, base) {
  const known = (id) => git(s.at, ['cat-file', '-e', id + '^{commit}'], { allowFail: true }).status === 0
  if (base && known(needCommitId(base.mergedCommit))) return base.mergedCommit
  return mergeBaseOf(s.at, s.mainTip, tip) || text(git(s.at, ['hash-object', '-t', 'tree', '--stdin'], { input: '' }))
}

function count(s, args) { return Number(text(git(s.at, ['rev-list', '--count'].concat(args)))) }

Object.assign(ops, {
  list(q, R) {
    const s = reading(R)
    const merged = new Map((q.merged || []).map((m) => [m.branch, m.base]))
    const names = [...s.branches.keys()].filter((n) => n !== s.main).sort()
    const shown = names.slice(0, q.max)
    const tips = shown.map((n) => s.branches.get(n))
    const logs = new Map()
    if (tips.length) for (const l of parseLog(git(s.at, ['log', '--no-walk=unsorted', '--format=' + LOG_FORMAT].concat([...new Set(tips)])).out)) logs.set(l.id, lineOf(l))
    const branches = shown.map((name) => {
      const head = s.branches.get(name)
      const m = merged.get(name)
      const has = (id) => id && git(s.at, ['cat-file', '-e', id + '^{commit}'], { allowFail: true }).status === 0
      const notAhead = [s.mainTip].concat(m && has(m.mergedCommit) ? [m.mergedCommit] : [])
      const notBehind = [head].concat(m && has(m.mergedVersion) ? [m.mergedVersion] : [])
      return {
        name, head,
        ahead: count(s, [head, '--not'].concat(notAhead)),
        behind: count(s, [s.mainTip, '--not'].concat(notBehind)),
        lastCommit: logs.get(head),
      }
    })
    return {
      main: { name: s.main, head: s.mainTip, versions: count(s, ['--first-parent', s.mainTip]) },
      branches, overflow: names.length > shown.length,
    }
  },

  changes(q, R) {
    const s = reading(R)
    const head = revOf(s, { branch: q.branch })
    const base = baseOf(s, head, q.base)
    const raw = String(git(s.at, ['diff-tree', '-r', '-z', '-M', '--numstat', base, head]).out).split('\0')
    const status = String(git(s.at, ['diff-tree', '-r', '-z', '-M', '--name-status', base, head]).out).split('\0')
    const kinds = new Map()
    for (let i = 0; i < status.length - 1;) {
      const st = status[i]
      if (st[0] === 'R' || st[0] === 'C') { kinds.set(status[i + 2], st[0] === 'R' ? 'renamed' : 'added'); i += 3 }
      else { kinds.set(status[i + 1], st[0] === 'A' ? 'added' : st[0] === 'D' ? 'deleted' : 'modified'); i += 2 }
    }
    const files = []
    for (let i = 0; i < raw.length - 1;) {
      const [a, d, p] = raw[i].split('\t')
      let from = null, to = p
      if (p === '') { from = raw[i + 1]; to = raw[i + 2]; i += 3 } else i += 1
      const status = kinds.get(to) || 'modified'
      files.push({
        path: to, status, from: status === 'renamed' ? from : null,
        additions: a === '-' ? null : Number(a), deletions: d === '-' ? null : Number(d),
      })
    }
    return { base, head, files: files.slice(0, q.max), overflow: files.length > q.max }
  },

  commits(q, R) {
    const s = reading(R)
    const head = revOf(s, { branch: q.branch })
    const base = baseOf(s, head, q.base)
    const range = git(s.at, ['cat-file', '-t', base]).out.toString().trim() === 'commit' ? [head, '^' + base] : [head]
    const all = parseLog(git(s.at, ['log', '-n', String(q.limit + 1), '--format=' + LOG_FORMAT].concat(range)).out).map(lineOf)
    return { commits: all.slice(0, q.limit), overflow: all.length > q.limit }
  },

  readFile(q, R) {
    const s = reading(R)
    const commit = revOf(s, q.rev)
    const entry = String(git(s.at, ['ls-tree', '-z', '-l', '--full-tree', commit, '--', q.path]).out).split('\0').filter(Boolean)[0]
    if (!entry) return { exists: false }
    const [mode, type, oid, size] = entry.slice(0, entry.indexOf('\t')).split(/\s+/)
    if (type !== 'blob' || entry.slice(entry.indexOf('\t') + 1) !== q.path) return { exists: false }
    const bytes = Number(size)
    if (bytes > q.max) return { exists: true, binary: false, tooLarge: true, bytes }
    const blob = git(s.at, ['cat-file', 'blob', oid]).out
    if (mode !== '120000' && blob.subarray(0, 8000).includes(0)) return { exists: true, binary: true, bytes }
    return { exists: true, binary: false, tooLarge: false, bytes, text: blob.toString('utf8') }
  },

  listTree(q, R) {
    const s = reading(R)
    const commit = revOf(s, q.rev)
    if (q.path) {
      const self = String(git(s.at, ['ls-tree', '-z', '--full-tree', commit, '--', q.path]).out).split('\0').filter(Boolean)[0]
      if (!self || self.split(/\s+/)[1] !== 'tree') return { exists: false }
    }
    const args = ['ls-tree', '-z', '-l', '--full-tree', commit].concat(q.path ? ['--', q.path + '/'] : [])
    const entries = String(git(s.at, args).out).split('\0').filter(Boolean).map((e) => {
      const tab = e.indexOf('\t')
      const [, type, , size] = e.slice(0, tab).split(/\s+/)
      const full = e.slice(tab + 1)
      return { name: full.split('/').pop(), path: full, kind: type === 'tree' ? 'dir' : 'file', bytes: type === 'blob' ? Number(size) : null }
    }).filter((e) => e.name.toLowerCase() !== '.git')
    entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return { exists: true, entries: entries.slice(0, q.max), overflow: entries.length > q.max }
  },

  versions(q, R) {
    const s = reading(R)
    const total = count(s, ['--first-parent', s.mainTip])
    let skip = 0
    if (q.before) {
      needCommitId(q.before)
      if (!lines(git(s.at, ['rev-list', '--first-parent', s.mainTip])).includes(q.before)) throw new Refusal('not_found')
      skip = total - versionNumber(s.at, q.before) + 1
    }
    const ids = lines(git(s.at, ['rev-list', '--first-parent', '--skip=' + skip, '-n', String(q.limit), s.mainTip]))
    const versions = ids.map((c, i) => {
      const l = parseLog(git(s.at, ['log', '-1', '--format=' + LOG_FORMAT, c]).out)[0]
      return { number: total - skip - i, commit: c, subject: l.subject, author: l.author, files: filesChanged(s.at, c), at: l.at }
    })
    return { versions, total, overflow: total - skip > ids.length }
  },
})
`
