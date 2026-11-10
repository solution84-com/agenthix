/**
 * The commit helper's program, part 7: one file of the workspace's repository at one commit, for the file viewer
 * (site protocol 1.18). Only a plain file of that commit's tree is read, by its exact path: never a link (it is not
 * followed, wherever it points), a submodule or a folder. `fileFacts` answers its blob id, size, commit time and first
 * bytes; `fileOut` writes its bytes whole, up to `max`, into the site's own folder (`roots.out`), which only the site
 * reads.
 */
export const PROGRAM_FILE_OPS = String.raw`
/** A path in the repository as the site checks it (core's \`isRepoPath\`): no step out, no \`.git\`, no control character. */
function needRepoPath(p) {
  if (typeof p !== 'string' || !p || p.length > 4096 || /[\x00-\x1f\x7f\\]/.test(p)) throw new Refusal('invalid')
  if (!p.split('/').every((s) => s && s !== '.' && s !== '..' && s.toLowerCase() !== '.git')) throw new Refusal('invalid')
  return p
}

/** The plain file at \`want\` in \`commit\`'s tree, or null. The path is literal (\`GIT_LITERAL_PATHSPECS\`) and must come back as given. */
function plainFileAt(s, commit, want) {
  const entry = String(git(s.at, ['ls-tree', '-z', '-l', '--full-tree', commit, '--', want]).out).split('\0').filter(Boolean)[0]
  if (!entry) return null
  const tab = entry.indexOf('\t')
  const [mode, type, oid, size] = entry.slice(0, tab).split(/\s+/)
  if (entry.slice(tab + 1) !== want || type !== 'blob' || (mode !== '100644' && mode !== '100755')) return null
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid)) return null
  return { oid, size: Number(size) }
}

function fileAt(q, R) {
  const s = reading(R)
  const commit = revOf(s, { commit: needCommitId(q.commit) })
  const file = plainFileAt(s, commit, needRepoPath(q.path))
  return { s, commit, file }
}

/** Runs one git with its standard output going to \`stdout\` (a descriptor, or a pipe of at most \`max\` bytes). */
function gitTo(s, args, stdout, max) {
  const left = DEADLINE - Date.now()
  if (left <= 0) throw new Refusal('timedOut')
  return cp.spawnSync(GIT, SAFE.concat(args), {
    cwd: s.at.dir, env: gitEnv(s.at), stdio: ['ignore', stdout, 'pipe'], timeout: left, ...(max ? { maxBuffer: max } : {}),
  })
}

Object.assign(ops, {
  fileFacts(q, R) {
    const { s, commit, file } = fileAt(q, R)
    if (!file) return { exists: false }
    const sniff = Math.max(0, Math.min(Number(q.sniff) || 0, 64 * 1024))
    let head = Buffer.alloc(0)
    if (sniff > 0 && file.size > 0) {
      // Only the first bytes: past \`sniff\` Node stops git, and what came is all that is wanted.
      const r = gitTo(s, ['cat-file', 'blob', file.oid], 'pipe', sniff)
      if (r.error && r.error.code === 'ETIMEDOUT') throw new Refusal('timedOut')
      if (r.error && r.error.code !== 'ENOBUFS') throw new Refusal('gitFailed', String(r.error.message))
      head = Buffer.from(r.stdout || []).subarray(0, sniff)
    }
    const at = text(git(s.at, ['log', '-1', '--format=%cI', commit]))
    return { exists: true, oid: file.oid, size: file.size, at, head: head.toString('base64') }
  },

  fileOut(q, R) {
    const { s, commit, file } = fileAt(q, R)
    if (!file) return { exists: false }
    if (!R.out) throw new Refusal('invalid')
    if (typeof q.max === 'number' && file.size > q.max) throw new Refusal('tooLarge')
    const part = path.join(R.out, 'blob.part')
    const fd = fs.openSync(part, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
    let r
    try { r = gitTo(s, ['cat-file', 'blob', file.oid], fd) } finally { fs.closeSync(fd) }
    if (r.error && r.error.code === 'ETIMEDOUT') throw new Refusal('timedOut')
    if (r.error || r.status !== 0) throw new Refusal('gitFailed', String(r.error ? r.error.message : r.stderr || '').slice(-2000))
    if (fs.lstatSync(part).size !== file.size) throw new Refusal('gitFailed', 'the file was not written whole')
    fs.renameSync(part, path.join(R.out, 'blob'))
    const at = text(git(s.at, ['log', '-1', '--format=%cI', commit]))
    return { exists: true, oid: file.oid, size: file.size, at }
  },
})
`
