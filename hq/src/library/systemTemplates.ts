/**
 * The one board template hq itself relies on: Workforce Assembly, where the built-in agent's proposed teams wait for
 * review. It ships in hq's image as `agenthix/workforce-assembly` (`hq/assets/library/boards/`), and the Assembly
 * board is the one made from any of its versions.
 */
import type { Prisma } from '@prisma/client'
import { AGENTHIX_PUBLISHER, formatAssetIdentity } from '@agenthix/core'

const WORKFORCE_ASSEMBLY = { publisher: AGENTHIX_PUBLISHER, name: 'workforce-assembly' } as const

export const WORKFORCE_ASSEMBLY_TEMPLATE = formatAssetIdentity(WORKFORCE_ASSEMBLY)

/** The boards made from Workforce Assembly, at whatever version. */
export const MADE_FROM_WORKFORCE_ASSEMBLY = {
  madeFromVersion: { asset: { kind: 'BOARD', ...WORKFORCE_ASSEMBLY } },
} satisfies Prisma.BoardWhereInput
