/**
 * The one task template hq itself relies on: Workforce Assembly, whose one type, Team proposal, holds the built-in
 * agent's proposed teams while they wait for review. It ships in hq's image as `agenthix/workforce-assembly`
 * (`hq/assets/library/task-templates/`), and the Workforce Assembly project is the one whose Team proposal type was made
 * from any of its versions. It is hq's own: the Library neither lists it nor adds it to another project.
 */
import type { Prisma } from '@prisma/client'
import { AGENTHIX_PUBLISHER, formatAssetIdentity } from '@agenthix/core'

const WORKFORCE_ASSEMBLY = { publisher: AGENTHIX_PUBLISHER, name: 'workforce-assembly' } as const

export const WORKFORCE_ASSEMBLY_TEMPLATE = formatAssetIdentity(WORKFORCE_ASSEMBLY)

/** The column of the Team proposal type a proposal waits in until it is confirmed. */
export const PROPOSAL_IN_REVIEW = 'In review'

/** Whether an asset is the system template, which no person adds to a project. */
export function isSystemTaskTemplate(asset: { kind: string; publisher: string; name: string }): boolean {
  return asset.kind === 'TASK_TEMPLATE' && asset.publisher === WORKFORCE_ASSEMBLY.publisher && asset.name === WORKFORCE_ASSEMBLY.name
}

/** The Library's rows other than the system template. */
export const NOT_SYSTEM_TEMPLATE = {
  NOT: { kind: 'TASK_TEMPLATE', ...WORKFORCE_ASSEMBLY },
} satisfies Prisma.AssetWhereInput

/** The task types made from Workforce Assembly, at whatever version. */
export const MADE_FROM_WORKFORCE_ASSEMBLY = {
  madeFromVersion: { asset: { kind: 'TASK_TEMPLATE', ...WORKFORCE_ASSEMBLY } },
} satisfies Prisma.TaskTypeWhereInput

/** The proposals waiting for review: tasks of the Team proposal type in its In review column. */
export const PROPOSAL_WAITING = {
  type: MADE_FROM_WORKFORCE_ASSEMBLY,
  typeColumn: { name: PROPOSAL_IN_REVIEW },
} satisfies Prisma.TaskWhereInput
