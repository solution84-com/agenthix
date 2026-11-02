/**
 * What the workspace delete's confirm says goes (on-screen spec, Deleting is permanent): a workspace's files live
 * on its site, and only what has been pushed to GitHub exists anywhere else. The site does not yet report which
 * files are unpushed, so the confirm says whether anything is backed up at all, and never claims a count.
 */
export function workspaceDeleteConfirm(repoUrl: string | null, state: { hasFiles: boolean } | null): string {
  if (state && !state.hasFiles) return 'Delete — it holds no files'
  if (!repoUrl) return state ? 'Delete — its files are not on GitHub, so they go with it' : 'Delete — any files it holds are not on GitHub, so they go with it'
  return state
    ? 'Delete — files not yet pushed to GitHub go with it; the repository is not affected'
    : 'Delete — any files not yet pushed to GitHub go with it; the repository is not affected'
}

type RemovalBranch = { name: string; whose: { personName: string | null }; ahead: number; working: { agentName: string } | null }

/** The most branches named in the confirm; the rest are counted. */
const BRANCHES_NAMED = 5

/**
 * The open branches the delete takes with it (live preview spec, *Defaults for review* 5): each one's name, whose it
 * is and how far ahead of main, and the agent working on it, which stops.
 */
export function withBranches(confirm: string, branches: readonly RemovalBranch[] | null | undefined): string {
  if (!branches || branches.length === 0) return confirm
  const line = (b: RemovalBranch) => {
    const facts = [b.whose.personName, `${b.ahead} commit${b.ahead === 1 ? '' : 's'} ahead of main`, b.working ? `${b.working.agentName} is working on it and stops` : null]
    return `${b.name} (${facts.filter(Boolean).join(', ')})`
  }
  const named = branches.slice(0, BRANCHES_NAMED).map(line)
  if (branches.length > BRANCHES_NAMED) named.push(`${branches.length - BRANCHES_NAMED} more`)
  return `${confirm}. Its ${branches.length === 1 ? 'branch goes' : `${branches.length} branches go`} too, with work not merged into main: ${named.join('; ')}`
}
