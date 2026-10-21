import type { ProjectRoleData } from './types'

/**
 * No project may be left without an admin (spec §6.4), so its last one carries no remove or leave control and no
 * role control: the server refuses them, and an affordance that always fails is worse than none.
 */
export function isLastAdmin(members: { role: ProjectRoleData }[], member: { role: ProjectRoleData }): boolean {
  if (member.role !== 'ADMIN') return false
  return members.filter(m => m.role === 'ADMIN').length <= 1
}