// Whether a version may carry the breaks found since the previous release, and the release notes' section for them.
// Under 0.x a break moves the minor, from 1.0.0 the major (docs/architecture/versioning.md). A version on the same line
// as the previous release (the same 0.minor, or from 1.0.0 the same major) may carry a break only as an alpha: a
// patch may not, a release candidate may not, and neither may a release after its own alphas, since data is carried
// forward from the last of them.
import { breakingFooter, isMarkedBreaking } from './commits.mjs'

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/
const STAGES = ['alpha', 'beta', 'rc']

export function parseVersion(text) {
  const m = String(text).match(VERSION)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], stage: m[4] ?? null, n: m[5] === undefined ? null : +m[5] }
}

export function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] - b[key]
  if (a.stage === b.stage) return (a.n ?? 0) - (b.n ?? 0)
  if (a.stage === null) return 1
  if (b.stage === null) return -1
  return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
}

/** The newest of `tags` below `version`: the release this one is compared with. */
export function previousTag(tags, version) {
  const target = parseVersion(version)
  return tags.map((tag) => ({ tag, v: parseVersion(tag) }))
    .filter(({ v }) => v && compareVersions(v, target) < 0)
    .sort((a, b) => compareVersions(b.v, a.v))[0]?.tag ?? null
}

const line = (v) => (v.major === 0 ? `0.${v.minor}` : `${v.major}`)

/** Null when `version` may carry a break after `previous`, else why not. */
export function breakRefusal(version, previous) {
  const v = parseVersion(version)
  if (!previous) return null
  const p = parseVersion(previous)
  if (line(v) !== line(p)) return null
  if (v.stage === 'alpha') return null
  const next = v.major === 0 ? `0.${v.minor + 1}.0` : `${v.major + 1}.0.0`
  return `${version} is on the same line as ${previous.replace(/^v/, '')}, so it may not break anything: a break is released as ${next}.`
}

/**
 * The problems that stop the release, and the notes' lines. `commits` are those since the previous tag; `detected`
 * the breaks found by comparison, each with the shas of the commits since the tag that changed its files.
 */
export function judge({ version, previous, commits, detected }) {
  const problems = []
  const marked = commits.filter((c) => isMarkedBreaking(c.message))
  for (const c of marked) {
    if (!breakingFooter(c.message)) problems.push(`${c.sha.slice(0, 8)} "${c.subject}" is marked breaking with no \`BREAKING CHANGE: <what an installation must do>\` footer.`)
  }
  const markedShas = new Set(marked.map((c) => c.sha))
  const explained = new Map(marked.map((c) => [c.sha, []]))
  for (const brk of detected) {
    const by = brk.shas.filter((sha) => markedShas.has(sha))
    if (by.length === 0) problems.push(`${brk.what}, and no commit since ${previous} that changed ${brk.files.join(', ')} is marked breaking.`)
    else explained.get(by[0]).push(brk.what)
  }
  if (marked.length || detected.length) {
    const refusal = breakRefusal(version, previous)
    if (refusal) {
      problems.push(refusal)
      for (const c of marked) problems.push(`  marked breaking: ${c.sha.slice(0, 8)} "${c.subject}"`)
      for (const brk of detected) problems.push(`  found: ${brk.what}`)
    }
  }
  const lines = marked.map((c) => {
    const found = explained.get(c.sha)
    const words = breakingFooter(c.message) ?? c.subject
    return `- ${words} (${c.sha.slice(0, 8)}${found.length ? `; ${found.join('; ')}` : ''})`
  })
  return { problems, lines }
}

export function notesSection(lines) {
  if (lines.length === 0) return ''
  return ['## Breaking changes, and what to do', '', ...lines, ''].join('\n')
}
