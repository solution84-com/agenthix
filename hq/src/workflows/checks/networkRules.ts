/**
 * The plain checks about what a version reaches (R1 rules 2, 4 and 6): hosts its code names that it may not reach,
 * installs that aren't pinned, and GitHub permissions beyond what its steps appear to need, new since the approved
 * version, or beyond what the App and the GitHub account have.
 */
import {
  INTEGRATION_SECRET_NAMES, permissionsBeyond,
  type GitHubPermissionLevel, type GitHubPermissions, type GitHubRepositoryPermission, type WorkflowCheckFlag,
  type WorkflowVersionContent,
} from '@agenthix/core'
import { allCode, argsOf, commandName, commandsOf, fileTexts, stepCode, type CodeLine } from './code'
import { flagAt, hostKey, permissionWords, placeWords, type GitHubCeiling } from './flag'
import { findInstalls } from './installs'

const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/(?:[^\s/@'"]+@)?(\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?/gi
const SSH_TARGET = /^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?::.*)?$/
const SSH_TOOLS = new Set(['ssh', 'scp', 'sftp', 'rsync'])
const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443, ws: 80, wss: 443, ssh: 22, git: 9418, ftp: 21, sftp: 22 }
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/
const COMMENT = /^\s*(#|\/\/)/

type Reached = { host: string; port: number | null; at: CodeLine }

function hostsIn(lines: CodeLine[]): Reached[] {
  const out: Reached[] = []
  for (const { at, segments } of commandsOf(lines.filter((l) => !COMMENT.test(l.text)))) {
    for (const m of at.text.matchAll(URL_RE)) {
      const scheme = m[1].toLowerCase()
      const port = m[3] ? Number(m[3]) : DEFAULT_PORTS[scheme] ?? null
      out.push({ host: m[2].toLowerCase(), port, at })
    }
    for (const seg of segments) {
      const name = commandName(seg)
      const args = argsOf(seg)
      const git = name === 'git' && args.some((w) => /^git@/.test(w.text))
      if (!SSH_TOOLS.has(name) && !git) continue
      const p = args.findIndex((w) => w.text === '-p' || w.text === '-P')
      const port = name === 'ssh' && p >= 0 ? Number(args[p + 1]?.text) || 22 : 22
      for (const w of args) {
        if (w.text.startsWith('-') || w.text.includes('://')) continue
        const t = SSH_TARGET.exec(w.text)
        if (t && (w.text.includes('@') || w.text.includes(':'))) out.push({ host: t[1].toLowerCase(), port, at })
      }
    }
  }
  return out
}

/** Rule 2: a host the files or runs name that isn't among the version's hosts. */
export function unlistedHosts(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const listed = new Set(content.definition.hosts.map(hostKey))
  const names = new Set(content.definition.hosts.map((h) => h.host))
  const seen = new Set<string>()
  const out: WorkflowCheckFlag[] = []
  for (const r of hostsIn(allCode(content))) {
    if (LOOPBACK.test(r.host)) continue
    const ok = r.port === null ? names.has(r.host) : listed.has(`${r.host}:${r.port}`)
    const key = r.port === null ? r.host : `${r.host}:${r.port}`
    if (ok || seen.has(key)) continue
    seen.add(key)
    out.push(flagAt(2, `${key} is used at ${placeWords(r.at)} but isn't in hosts:, so the run can't reach it.`, r.at))
  }
  return out
}

/** Rule 4: an install that isn't pinned, or a download piped into a shell. */
export function unpinnedInstalls(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const texts = fileTexts(content)
  return findInstalls(commandsOf(allCode(content, texts)), content.files.map((f) => f.path), texts)
    .filter((i) => !i.pinned)
    .map((i) => flagAt(4, i.pipedToShell
      ? `${i.what} at ${placeWords(i.at)} runs whatever the download is at the time.`
      : `${i.what} at ${placeWords(i.at)} isn't pinned: add the lock file to the version's files, or give an exact version and checksum.`, i.at))
}

type Need = Partial<Record<GitHubRepositoryPermission, GitHubPermissionLevel>>

/** What a command appears to need of GitHub; 'unknown' for one whose need can't be told, such as `gh api`. */
function needOf(name: string, args: string[]): Need | 'unknown' | null {
  const operands = args.filter((x, i) => !x.startsWith('-') && !(name === 'git' && (args[i - 1] === '-C' || args[i - 1] === '-c')))
  const [a, b] = operands
  if (name === 'push-bundle') return { contents: 'write' }
  if (name === 'git') {
    if (a === 'push') return { contents: 'write' }
    if (['fetch', 'pull', 'clone', 'ls-remote'].includes(a ?? '')) return { contents: 'read' }
    return null
  }
  if (name === 'curl' || name === 'wget') return args.some((x) => x.includes('api.github.com')) ? 'unknown' : null
  if (name !== 'gh') return null
  const reads = ['view', 'list', 'diff', 'checks', 'status', 'download']
  const level: GitHubPermissionLevel = reads.includes(b ?? '') ? 'read' : 'write'
  switch (a) {
    // `gh pr create` reads the repository's default branch over GraphQL before it opens the pull request.
    case 'pr': return b === 'create' ? { pull_requests: level, contents: 'read' } : { pull_requests: level }
    case 'issue': return { issues: level }
    // An environment's secrets are the environment's: `--env` needs environments, not the repository's secrets.
    case 'secret': return args.some((x) => x === '--env' || x === '-e' || x.startsWith('--env=')) ? { environments: level } : { secrets: level }
    case 'variable': return { variables: level }
    case 'release': return { contents: level }
    case 'workflow': case 'run': return { actions: level }
    case 'repo': return b === 'clone' ? { contents: 'read' } : 'unknown'
    default: return 'unknown'
  }
}

function neededPermissions(content: WorkflowVersionContent): Need | 'unknown' {
  const need: Need = { metadata: 'read' }
  const texts = fileTexts(content)
  for (let i = 0; i < content.definition.steps.length; i++) {
    if (!content.definition.steps[i].secrets.includes(INTEGRATION_SECRET_NAMES[0])) continue
    for (const { segments } of commandsOf(stepCode(content, i, texts))) {
      for (const seg of segments) {
        const n = needOf(commandName(seg), argsOf(seg).map((w) => w.text))
        if (n === 'unknown') return 'unknown'
        for (const [k, v] of Object.entries(n ?? {}) as [GitHubRepositoryPermission, GitHubPermissionLevel][]) {
          if (need[k] !== 'write') need[k] = v
        }
      }
    }
  }
  return need
}

const entries = (p: GitHubPermissions) => Object.entries(p) as [GitHubRepositoryPermission, GitHubPermissionLevel][]
const words = (p: GitHubPermissions) => entries(p).map(([k, v]) => `${permissionWords(k)}: ${v}`).join(', ')

/** Rule 6. `ceiling` is unknown until hq reads the App's and the account's permissions; then nothing is flagged for it. */
export function githubPermissionChecks(
  content: WorkflowVersionContent, approved: WorkflowVersionContent | null, ceiling: GitHubCeiling,
): WorkflowCheckFlag[] {
  const github = content.definition.github
  if (!Object.keys(github).length) return []
  const out: WorkflowCheckFlag[] = []
  const need = neededPermissions(content)
  if (need !== 'unknown') {
    for (const [k, v] of entries(permissionsBeyond(github, need))) {
      out.push(flagAt(6, `${permissionWords(k)}: ${v} is more than the steps appear to need${need[k] ? ` (${need[k]})` : ''}.`, { path: `github.${k}` }))
    }
  }
  if (approved) {
    const added = permissionsBeyond(github, approved.definition.github)
    if (Object.keys(added).length) out.push(flagAt(6, `New GitHub permissions since the approved version: ${words(added)}.`, { path: 'github' }))
  }
  if (ceiling.known) {
    const beyondApp = permissionsBeyond(github, ceiling.app)
    for (const [k, v] of entries(beyondApp)) {
      out.push(flagAt(6, `This needs ${permissionWords(k)}: ${v}. Add it in the App's settings on GitHub; each GitHub account using it then accepts it there.`, { path: `github.${k}` }))
    }
    for (const [k, v] of entries(permissionsBeyond(github, ceiling.account))) {
      if (beyondApp[k]) continue
      out.push(flagAt(6, `The GitHub account hasn't accepted ${permissionWords(k)}: ${v} yet. An owner of the account accepts it in its GitHub App settings.`, { path: `github.${k}` }))
    }
  }
  return out
}
