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
