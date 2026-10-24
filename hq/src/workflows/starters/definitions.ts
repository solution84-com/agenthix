/**
 * The starter workflows (workflows spec part 4, *The starter workflows*): `push`, `pull`, `open-pull-request` and
 * `set-github-secrets`, shipped as definitions and files that hq proposes like any other version. Each needs only
 * `github.com:443` and `api.github.com:443`, and takes the repository's address from hq (`$GITHUB_REPOSITORY_URL`,
 * `$GITHUB_REPOSITORY`), never from the workspace's `remote.origin.url`.
 *
 * Git with the token never runs in the agent's repository (spec part 4): a step with no secret works in the
 * workspace and hands over a bundle, data only; a step with the token works in a new, empty repository under `/tmp`
 * with system and user config and hooks off. `gh` is given `--repo` and run from `/tmp`, outside the workspace.
 * Parameters reach a step only as files under `/run/params`.
 */
import { INTEGRATION_SECRET_NAMES, type GitHubPermissions } from '@agenthix/core'

/** A starter as a definition's plain data, as `workflow.yaml` would leave it, and its files' text. */
export type StarterSource = {
  definition: Record<string, unknown>
  files: { path: string; text: string; executable: boolean }[]
}

export const STARTER_NAMES = ['push', 'pull', 'open-pull-request', 'set-github-secrets'] as const
export type StarterName = (typeof STARTER_NAMES)[number]

/** The starters proposed when a repository is connected; `set-github-secrets` follows its first secret. */
export type ConnectStarterName = Exclude<StarterName, 'set-github-secrets'>
export const STARTERS_AT_CONNECT: readonly ConnectStarterName[] = ['push', 'pull', 'open-pull-request']

const TOKEN = INTEGRATION_SECRET_NAMES[0]
const GITHUB_HOSTS = ['github.com:443', 'api.github.com:443']
/** A branch: no leading `-`, so it is never read as an option, and passed on as `refs/heads/<branch>`. */
export const BRANCH_PATTERN = '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$'

/** The GitHub Environment `set-github-secrets` sets its secrets on. */
export const GITHUB_SECRETS_ENVIRONMENT = 'production'

/** The words the approval of `set-github-secrets` carries (spec part 4, *Secrets for GitHub Actions*). */
export const GITHUB_SECRETS_CARD_WORDS =
  `These values reach any GitHub workflow that runs in the ${GITHUB_SECRETS_ENVIRONMENT} environment, on branches that need a reviewed pull request to change.`

const branchParameter = (name: string) => ({ name, pattern: BRANCH_PATTERN })

const PUSH: StarterSource = {
  definition: {
    name: 'push',
    description: 'Pushes a branch of this workspace to its GitHub repository. It never forces a push, and never pushes to a protected branch.',
    hosts: GITHUB_HOSTS,
    github: { contents: 'write' } satisfies GitHubPermissions,
    parameters: [branchParameter('branch')],
    steps: [
      {
        name: 'Bundle the branch',
        run: 'git check-ref-format --branch "$(cat /run/params/branch)" > /dev/null && git -c safe.directory="$PWD" bundle create /run/out/push.bundle "refs/heads/$(cat /run/params/branch)"',
      },
      {
        name: 'Push the bundle',
        secrets: [TOKEN],
        run: 'push-bundle /run/out/push.bundle "$(cat /run/params/branch)"',
      },
    ],
  },
  files: [],
}

const FETCH_BRANCH = `#!/bin/sh
# Fetches one branch of the repository HQ named into a new, empty repository, with no system or user config and no
# hooks, and bundles it for the next step. The workspace's repository is never used here: its hooks and config are
# the agent's.
set -eu
branch="$(cat /run/params/branch)"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0
export GH_TOKEN="$(cat /run/secrets/GITHUB_TOKEN)"
repo="$(mktemp -d /tmp/pull.XXXXXX)"
cd "$repo"
git init -q .
git config core.hooksPath /dev/null
git config credential.helper '!gh auth git-credential'
git fetch -q --no-tags "$GITHUB_REPOSITORY_URL" "refs/heads/$branch:refs/heads/$branch"
git bundle create /run/out/pull.bundle "refs/heads/$branch"
`

const UPDATE_WORKSPACE = `#!/bin/sh
# Brings the branch from the bundle the previous step made into the workspace, fast-forward only: the checked-out
# branch is pulled; any other is moved only if it can be fast-forwarded.
set -eu
branch="$(cat /run/params/branch)"
# The snapshot may belong to the site's user rather than the step's; this step works in it either way.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PWD"
git fetch -q --no-tags /run/out/pull.bundle "+refs/heads/$branch:refs/remotes/origin/$branch"
if [ "$(git symbolic-ref -q --short HEAD || true)" = "$branch" ]; then
  git pull -q --ff-only --no-tags /run/out/pull.bundle "refs/heads/$branch"
else
  git fetch -q --no-tags /run/out/pull.bundle "refs/heads/$branch:refs/heads/$branch"
fi
`

const PULL: StarterSource = {
  definition: {
    name: 'pull',
    description: 'Brings a branch from this workspace\'s GitHub repository into the workspace, fast-forward only.',
    hosts: GITHUB_HOSTS,
    github: { contents: 'read' } satisfies GitHubPermissions,
    parameters: [branchParameter('branch')],
    steps: [
      { name: 'Fetch the branch', secrets: [TOKEN], run: './fetch-branch.sh' },
      { name: 'Bring it into the workspace', run: './update-workspace.sh' },
    ],
  },
  files: [
    { path: 'fetch-branch.sh', text: FETCH_BRANCH, executable: true },
    { path: 'update-workspace.sh', text: UPDATE_WORKSPACE, executable: true },
  ],
}

const OPEN_PULL_REQUEST: StarterSource = {
  definition: {
    name: 'open-pull-request',
    description: 'Opens a pull request on this workspace\'s GitHub repository from a branch already pushed, with the title and body given.',
    hosts: GITHUB_HOSTS,
    // `gh pr create` reads the repository's default branch over GraphQL first, which needs contents: read.
    github: { pull_requests: 'write', contents: 'read' } satisfies GitHubPermissions,
    parameters: [branchParameter('branch'), branchParameter('base'), { name: 'title', text: true }, { name: 'body', text: true }],
    steps: [
      {
        name: 'Open the pull request',
        secrets: [TOKEN],
        run: 'cd /tmp && GH_TOKEN="$(cat /run/secrets/GITHUB_TOKEN)" GH_PROMPT_DISABLED=1 gh pr create --repo "$GITHUB_REPOSITORY" --head "$(cat /run/params/branch)" --base "$(cat /run/params/base)" --title "$(cat /run/params/title)" -F /run/params/body',
      },
    ],
  },
  files: [],
}

/**
 * `set-github-secrets` for the names an administrator chose: one step for each, holding only the token and that
 * secret, setting it as an environment secret, never a repository one. With no names there is nothing to set, so
 * it has no definition (null).
 */
export function setGitHubSecretsSource(names: readonly string[]): StarterSource | null {
  const sorted = [...new Set(names)].sort()
  if (!sorted.length) return null
  return {
    definition: {
      name: 'set-github-secrets',
      description: `Sets secrets of this place on GitHub, as secrets of the ${GITHUB_SECRETS_ENVIRONMENT} environment, whose deployment branches are protected branches only. ${GITHUB_SECRETS_CARD_WORDS}`,
      hosts: GITHUB_HOSTS,
      github: { environments: 'write' } satisfies GitHubPermissions,
      parameters: [{ name: 'environment', values: [GITHUB_SECRETS_ENVIRONMENT] }],
      steps: sorted.map((name) => ({
        name: `Set ${name}`,
        secrets: [TOKEN, name],
        run: `cd /tmp && GH_TOKEN="$(cat /run/secrets/GITHUB_TOKEN)" GH_PROMPT_DISABLED=1 gh secret set ${name} --repo "$GITHUB_REPOSITORY" --env "$(cat /run/params/environment)" < /run/secrets/${name}`,
      })),
    },
    files: [],
  }
}

export function starterSource(name: ConnectStarterName): StarterSource {
  return { push: PUSH, pull: PULL, 'open-pull-request': OPEN_PULL_REQUEST }[name]
}

/** The parameter that names the branch a run writes to, for the starters that refuse a protected one. */
export const PROTECTED_TARGET_PARAMETER: Partial<Record<StarterName, string>> = { push: 'branch', 'open-pull-request': 'branch' }
