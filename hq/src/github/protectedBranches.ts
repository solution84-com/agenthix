/**
 * Whether a branch of a location's repository is protected (workflows spec part 4, *Secrets for GitHub Actions are
 * kept from code the agent pushes*): `push` and `open-pull-request` refuse a protected branch as their target, read
 * from GitHub when the run starts rather than trusted to the parameter's pattern. An environment whose deployment
 * branches are protected branches only gives its secrets to code on those branches, so code the agent pushes must
 * never land on one.
 *
 * A branch counts as protected when any of these says so, and HQ refuses when it can't tell:
 * - GitHub's answer for the branch, when it exists (`protected`);
 * - a ruleset rule that applies to the branch's name (rulesets apply to names, existing or not);
 * - a classic protection rule whose pattern matches the name. A branch that doesn't exist yet has no answer of its
 *   own, and a wildcard rule (`release/*`) would protect it the moment the push made it.
 *
 * The token is HQ's own, minted through the mint gate with only what reading this needs, and ended at once.
 */
import { HttpError } from 'wasp/server'
import type { GitHubPermissions } from '@agenthix/core'
import { mintForLocation, revokeGateToken, type GateToken, type LocationMint } from './mintGate'

export type GitHubLocation = Omit<LocationMint, 'permissions' | 'needs'>

export type LocationApiDeps = {
  mint(req: LocationMint): Promise<GateToken>
  revoke(token: string): Promise<boolean>
  fetch(url: string, init: RequestInit): Promise<Response>
}
export const locationApiDeps: LocationApiDeps = { mint: mintForLocation, revoke: revokeGateToken, fetch: (u, i) => fetch(u, i) }

export type LocationApi = {
  repository: string
  /** A REST path under `/repos/<owner>/<repo>`, or a full path starting `/graphql`. */
  call(path: string, init?: RequestInit): Promise<Response>
}

/** A token for the location's repository with `permissions`, ended once `use` is done. */
export async function withLocationApi<T>(
  loc: GitHubLocation, permissions: GitHubPermissions, use: (api: LocationApi) => Promise<T>, deps: LocationApiDeps = locationApiDeps,
): Promise<T> {
  const t = await deps.mint({ ...loc, needs: 'work', permissions })
  const repository = t.repository.fullName
  const api: LocationApi = {
    repository,
    call: (path, init = {}) => deps.fetch(`https://api.github.com${path.startsWith('/graphql') ? path : `/repos/${repository}${path}`}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    }),
  }
  try {
    return await use(api)
  } finally {
    await deps.revoke(t.token).catch(() => false)
  }
}

/**
 * Whether `name` matches a classic protection rule's pattern (GitHub's fnmatch syntax), read widely: `*` and `?` are
 * taken to match `/` too, so a pattern can only ever match more names than GitHub's, never fewer.
 */
export function matchesProtectionPattern(pattern: string, name: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') re += '.*'
    else if (c === '?') re += '.'
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2)
      if (end < 0) { re += '\\['; continue }
      const body = pattern.slice(i + 1, end).replace(/\\/g, '\\\\')
      re += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
      i = end
    } else re += c.replace(/[.+^${}()|\\\]]/g, '\\$&')
  }
  return new RegExp(`^${re}$`).test(name)
}

const PATTERNS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { branchProtectionRules(first: 100) { nodes { pattern } pageInfo { hasNextPage } } }
}`

export type BranchProtection = { protected: false } | { protected: true; why: string }

const cannotTell = (repository: string, what: string, status?: number): never => {
  const next = status === 401 || status === 403
    ? 'Check the App still has Administration: read on the repository'
    : 'Try again'
  throw new HttpError(502, `HQ couldn't read the branch protection of ${repository} from GitHub (${what}), so it won't push or open a pull request. ${next}. Nothing was changed.`)
}

/**
 * GitHub answers 403 with this when the repository's plan has no rulesets (a private repository on the free plan), so
 * none can apply. Any other 403 still can't be told; a reworded answer refuses, never passes.
 */
const PLAN_HAS_NO_RULESETS = /^Upgrade to GitHub Pro or make this repository public/

async function rulesetsUnavailable(res: Response): Promise<boolean> {
  if (res.status !== 403) return false
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null
  return typeof body?.message === 'string' && PLAN_HAS_NO_RULESETS.test(body.message)
}

/** What GitHub says of the branch's protection. Throws an HttpError when it can't be told. */
export async function readBranchProtection(api: LocationApi, branch: string): Promise<BranchProtection> {
  const ref = encodeURIComponent(branch)
  const b = await api.call(`/branches/${ref}`)
  if (b.ok) {
    const body = (await b.json()) as { protected?: boolean }
    if (body.protected !== false) return { protected: true, why: 'GitHub marks it protected' }
  } else if (b.status !== 404) cannotTell(api.repository, `the branch: ${b.status}`, b.status)

  const rules = await api.call(`/rules/branches/${ref}`)
  let applied: { type?: string }[] = []
  if (rules.ok) {
    applied = (await rules.json()) as { type?: string }[]
    if (!Array.isArray(applied)) cannotTell(api.repository, 'its rulesets')
  } else if (!(await rulesetsUnavailable(rules))) cannotTell(api.repository, `its rulesets: ${rules.status}`, rules.status)
  if (applied.length) return { protected: true, why: `a ruleset applies to it (${[...new Set(applied.map((r) => r.type))].join(', ')})` }

  const [owner, name] = api.repository.split('/')
  const g = await api.call('/graphql', { method: 'POST', body: JSON.stringify({ query: PATTERNS_QUERY, variables: { owner, name } }) })
  if (!g.ok) cannotTell(api.repository, `its protection rules: ${g.status}`, g.status)
  const data = (await g.json()) as {
    data?: { repository?: { branchProtectionRules?: { nodes?: { pattern?: string }[]; pageInfo?: { hasNextPage?: boolean } } } }
    errors?: unknown[]
  }
  const found = data.data?.repository?.branchProtectionRules
  if (data.errors?.length || !found || !Array.isArray(found.nodes)) cannotTell(api.repository, 'its protection rules')
  if (found!.pageInfo?.hasNextPage) cannotTell(api.repository, 'more than 100 protection rules')
  const hit = found!.nodes!.find((n) => typeof n.pattern === 'string' && matchesProtectionPattern(n.pattern, branch))
  if (hit) return { protected: true, why: `the protection rule ${hit.pattern} matches it` }
  return { protected: false }
}

/** Reading a branch and its rules: contents for the branch, metadata for rulesets, administration for the patterns. */
export const PROTECTION_READ_PERMISSIONS: GitHubPermissions = { contents: 'read', metadata: 'read', administration: 'read' }

/** Refuses, with an HttpError, a run whose target branch is protected. */
export async function refuseProtectedBranch(
  loc: GitHubLocation, workflowName: string, branch: string, deps: LocationApiDeps = locationApiDeps,
): Promise<void> {
  const found = await withLocationApi(loc, PROTECTION_READ_PERMISSIONS, async (api) => ({ repository: api.repository, p: await readBranchProtection(api, branch) }), deps)
  if (found.p.protected) {
    throw new HttpError(409, `${branch} is a protected branch of ${found.repository} (${found.p.why}), and ${workflowName} never writes to one: a protected branch changes only through a reviewed pull request. Use another branch. Nothing was changed.`)
  }
}
