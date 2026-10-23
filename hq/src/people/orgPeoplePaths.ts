/** Where Organisation › People lives, for the links that lead there from a project. */
export function orgPeoplePath(userId?: string): string {
  return userId ? `/admin/people/${userId}` : '/admin/people'
}

/** The People of Organisation, with the invite form open. */
export function orgInvitePath(): string {
  return '/admin/people?invite=1'
}
