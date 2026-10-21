import { prisma } from 'wasp/server'
import { ACTIVE_PERSON } from './people'

/**
 * People in the org — read each time, never stored (spec §6.3). An unconsumed invite is not a person, and
 * neither is someone who has left (adr-0100).
 */
export async function countOrgPeople(): Promise<number> {
  return prisma.user.count({ where: ACTIVE_PERSON })
}
