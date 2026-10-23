/** The admin area is every address under /admin. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

/**
 * Where a former /org address now lives, or null when it did not move. Teams did not: a member still sees them
 * from the main frame, and an admin manages them at /admin/teams.
 */
export function adminPathFor(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/org/dashboard') return '/admin'
  if (path === '/org/settings/sites') return '/admin/sites-for-projects'
  const sites = /^\/org\/settings\/where-work-runs(\/.*)?$/.exec(path)
  if (sites) return `/admin/where-work-runs${sites[1] ?? ''}`
  const moved = /^\/org\/(people|agents|settings|infrastructure)(\/.*)?$/.exec(path)
  return moved ? `/admin/${moved[1]}${moved[2] ?? ''}` : null
}

/** The teams pages in the frame the person is in: a member's view, or the admin area's. */
export function teamsBase(pathname: string): string {
  return isAdminPath(pathname) ? '/admin/teams' : '/org/teams'
}
