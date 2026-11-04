export type GithubAppStatusResult =
  | { registered: false }
  | { registered: true; slug: string; installations: { login: string; type: string }[]; canCreateRepos: boolean }

/**
 * What the GitHub App's status shows a member. Every member needs whether the App is registered and whether it can
 * create repositories; which outside accounts installed the public App is for administrators.
 */
export function githubAppStatusView(
  app: { slug: string } | null, installations: { accountLogin: string; accountType: string }[], isAdmin: boolean,
): GithubAppStatusResult {
  if (!app) return { registered: false }
  const list = installations.map((i) => ({ login: i.accountLogin, type: i.accountType }))
  // Repo creation needs an organisation install (POST /orgs/{org}/repos); personal installs can only link.
  return { registered: true, slug: app.slug, installations: isAdmin ? list : [], canCreateRepos: list.some((i) => i.type === 'Organization') }
}
