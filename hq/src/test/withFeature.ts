/**
 * `withFeature(flag, () => { … })` for hq's integration suite (adr-0172; live preview spec section 7, *Tests*): before
 * each test in the group the flag is switched on on the test organisation's record, as the *Features* screen does, and
 * after it the record's switch is cleared again. It builds on core's `withFeature`, so the flag is also on in memory
 * for code that never reads the record, and a failing test of an experimental flag is recorded rather than failing.
 *
 * Each integration test starts from an empty database, so a test that makes its organisation inside the group finds
 * the switch there through the in-memory one; one made before, by a `beforeEach`, carries it on its record too.
 */
import { afterEach, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'
import { withFeature as withFeatureInMemory } from '@agenthix/core/testing'
import type { FeatureFlag } from '@agenthix/core'
import { prisma } from './db'
import { forgetFeatureSwitches, readStoredSwitches } from '../features/switches'

async function setOnRecord(flag: FeatureFlag, on: boolean | null): Promise<void> {
  for (const org of await prisma.org.findMany({ select: { id: true, featureSwitches: true } })) {
    const switches: Record<string, unknown> = { ...readStoredSwitches(org.featureSwitches) }
    if (on === null) delete switches[flag]
    else switches[flag] = { on, byUserId: null, at: new Date().toISOString() }
    await prisma.org.update({ where: { id: org.id }, data: { featureSwitches: switches as Prisma.InputJsonObject } })
  }
  forgetFeatureSwitches()
}

export function withFeature(flag: FeatureFlag, body: () => void): void {
  withFeatureInMemory(flag, () => {
    beforeEach(() => setOnRecord(flag, true))
    afterEach(() => setOnRecord(flag, null))
    body()
  })
}
