export type SettingsViewer = { personal: boolean; isProjectAdmin: boolean; isOrgAdmin: boolean }

export type DeleteOffer = 'delete' | 'only-org-admin' | 'none'

/**
 * Who may change which part of a project's Settings, as the server enforces it:
 * the project's own fields are its admins' (updateProject, setProjectLead,
 * setProjectAccessLevel); filing under a product or programme and deleting are
 * the organisation admins'. A personal project is its person's alone, with none
 * of the shared parts, and its owner deletes it.
 */
export function settingsRights({ personal, isProjectAdmin, isOrgAdmin }: SettingsViewer) {
  // A personal project is deleted by its owner, who is its one admin; no one else is offered it. Your space is never deleted.
  let deleteOffer: DeleteOffer = 'none'
  if (personal) deleteOffer = isProjectAdmin ? 'delete' : 'none'
  else deleteOffer = isOrgAdmin ? 'delete' : isProjectAdmin ? 'only-org-admin' : 'none'
  return {
    editOwn: isProjectAdmin,
    editFiling: isOrgAdmin && !personal,
    namesAdmins: !isProjectAdmin && !personal,
    deleteOffer,
  }
}

/** The one line a person who may not change the settings reads: who can. */
export function adminsLine(adminNames: string[]): string {
  if (adminNames.length === 0) return 'This project has no admin.'
  if (adminNames.length === 1) return `${adminNames[0]} is this project's admin and can change these settings.`
  const last = adminNames[adminNames.length - 1]
  return `${adminNames.slice(0, -1).join(', ')} and ${last} are this project's admins and can change these settings.`
}

export type KeyState = { locked: true; reason: string } | { locked: false }

export function keyState(taskCount: number, key: string): KeyState {
  if (taskCount === 0) return { locked: false }
  return { locked: true, reason: `Fixed — its ${taskCount} task${taskCount === 1 ? ' is' : 's are'} numbered ${key}-1 onwards` }
}

/** Returns the problem with a typed key, or null. */
export function keyProblem(key: string): string | null {
  return /^[A-Z]{2,6}$/.test(key) ? null : 'A project key is 2 to 6 letters'
}
