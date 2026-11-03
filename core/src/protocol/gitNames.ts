/**
 * What a branch's Git methods (`branchWork.ts`, `branchReads.ts`, `mainWork.ts`) accept as a name, a path, a commit,
 * a person or a message. An agent writes what reaches most of these, so both ends check them: hq before it asks, and
 * the site again, building its validators from these predicates. A value one of them refuses never reaches `git`.
 *
 * Two rules for branch names:
 * - `isWorkBranchName`: the names hq gives (live preview spec, *Branch names*): lowercase words joined by hyphens, at
 *   most `WORK_BRANCH_NAME_MAX` characters, a `-2`, `-3` included. `branchNameFromWork` makes one.
 * - `isGitBranchName`: any branch a method may name, such as one an agent made with its own `git`
 *   (`backup/login-page-2026-11-01`) or one from GitHub. Git's own `check-ref-format` rules for `refs/heads/<name>`,
 *   and tighter: printable ASCII only, no leading `-`, not `HEAD`, at most `GIT_BRANCH_NAME_MAX` characters.
 */

export const WORK_BRANCH_NAME_MAX = 50
export const GIT_BRANCH_NAME_MAX = 200
/** A path inside a repository, from its root. */
export const REPO_PATH_MAX = 4096
const REPO_PATH_SEGMENT_MAX = 255
export const GIT_PERSON_NAME_MAX = 200
export const GIT_EMAIL_MAX = 254
export const COMMIT_MESSAGE_MAX = 10_000

const WORK_BRANCH = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Printable ASCII without space and without Git's own forbidden characters: ~ ^ : ? * [ \ and DEL.
const BRANCH_CHARS = /^[!-~]+$/
const BRANCH_FORBIDDEN = /[~^:?*[\\\x7f]/
// A full object id: SHA-1 (40) or SHA-256 (64), lowercase. Never an abbreviation, a ref or an expression.
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
// A copy's folder id: the lowercase uuid hq minted for it.
const COPY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CONTROL = /[\x00-\x1f\x7f]/
const MESSAGE_CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/

export function isWorkBranchName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= WORK_BRANCH_NAME_MAX && WORK_BRANCH.test(name)
}

export function isGitBranchName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > GIT_BRANCH_NAME_MAX) return false
  if (!BRANCH_CHARS.test(name) || BRANCH_FORBIDDEN.test(name)) return false
  if (name.startsWith('-') || name === 'HEAD' || name === '@') return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.')) return false
  return name.split('/').every(part => !part.startsWith('.') && !part.endsWith('.lock'))
}

export function isCommitId(id: unknown): id is string {
  return typeof id === 'string' && COMMIT_ID.test(id)
}

export function isCopyId(id: unknown): id is string {
  return typeof id === 'string' && COPY_ID.test(id)
}

/**
 * A file's path from the repository's root, `/`-separated: no leading `/`, no empty, `.` or `..` part, no part
 * beginning with `-`, no `.git` part in any letter case, no backslash and no control character.
 */
export function isRepoPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > REPO_PATH_MAX) return false
  if (CONTROL.test(path) || path.includes('\\')) return false
  return path.split('/').every(part =>
    part.length > 0 && part.length <= REPO_PATH_SEGMENT_MAX && part !== '.' && part !== '..' &&
    !part.startsWith('-') && part.toLowerCase() !== '.git')
}

/** A name Git writes into a commit's author line: no `<`, `>` or control character, not blank. */
export function isGitPersonName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= GIT_PERSON_NAME_MAX &&
    !CONTROL.test(name) && !/[<>]/.test(name)
}

/** An address Git writes between `<` and `>`: one `@`, no space, `<`, `>` or control character. */
export function isGitEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= GIT_EMAIL_MAX && /^[^\s<>@]+@[^\s<>@]+$/.test(email) &&
    !CONTROL.test(email)
}

/** A commit's message: not blank, at most `COMMIT_MESSAGE_MAX` characters, no control character but tab and newline. */
export function isCommitMessage(message: unknown): message is string {
  return typeof message === 'string' && message.trim().length > 0 && message.length <= COMMIT_MESSAGE_MAX &&
    !MESSAGE_CONTROL.test(message)
}

/**
 * The branch name hq gives a piece of work, from the task's title or what the person first asked: lowercase words
 * joined by hyphens, cut at a word to `WORK_BRANCH_NAME_MAX` characters, with `-2`, `-3` when `taken` says the name
 * is. Short words that carry no meaning (*a*, *an*, *the*) are left out: *Add a login page* is `add-login-page`.
 */
export function branchNameFromWork(text: string, taken: (name: string) => boolean): string {
  const words = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length > 0 && !FILLER.has(w))
  const base = cut(words.length ? words : ['work'], WORK_BRANCH_NAME_MAX)
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const name = `${cut(base.split('-'), WORK_BRANCH_NAME_MAX - suffix.length)}${suffix}`
    if (!taken(name)) return name
  }
}

const FILLER = new Set(['a', 'an', 'the'])

/** Words joined by hyphens, as many as fit in `max`; a first word longer than `max` is cut. */
function cut(words: string[], max: number): string {
  let out = ''
  for (const word of words) {
    const next = out ? `${out}-${word}` : word
    if (next.length > max) break
    out = next
  }
  return out || words[0]!.slice(0, max)
}
