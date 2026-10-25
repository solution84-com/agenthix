/**
 * Deleting a project, or erasing a person, deletes the secrets, variables and workflows of its places with their
 * records: nothing of a place outlives it (spec part 3; adr-0100 for erasing). A workflow's versions, approvals, runs,
 * steps, minted-token rows and switches cascade from it. A place is a logical reference, so nothing
 * cascades; the code that deletes the place runs these in its own transaction, interactive (`deleteProject`) or
 * batched (`erasePerson`).
 */
import type { Prisma } from '@prisma/client'
import { placeWhere, type Place } from './place'

type Db = Pick<Prisma.TransactionClient, 'placeSecret' | 'secretRecord' | 'placeVariable' | 'placeVariableChange' | 'workflow'>

export function deletePlaceRecordsOf(db: Db, places: Place[]): Prisma.PrismaPromise<Prisma.BatchPayload>[] {
  if (places.length === 0) return []
  const where = { OR: places.map(placeWhere) }
  return [
    db.placeSecret.deleteMany({ where }),
    db.secretRecord.deleteMany({ where }),
    db.placeVariable.deleteMany({ where }),
    db.placeVariableChange.deleteMany({ where }),
    db.workflow.deleteMany({ where }),
  ]
}
