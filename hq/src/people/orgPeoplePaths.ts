/** Where Organisation › People lives, for the links that lead there from a project. */
export function orgPeoplePath(userId?: string): string {
  return userId ? `/org/people/${userId}` : '/org/people'
}

/** The People of Organisation, with the invite form open. */
export function orgInvitePath(): string {
  return '/org/people?invite=1'
}
