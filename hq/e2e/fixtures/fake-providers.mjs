// A provider row as HQ would store a working one, with an obviously fake key, for the fixtures that put providers
// in a database without going through the add-provider check (which reaches the vendor).
import { encryptSecret, hqMasterKey } from './guide-sample-access.mjs'

export const FAKE_KEY = 'sk-test-fake-not-a-key'
// HQ re-checks a working provider with its vendor every hour, and a fake key would then reach the vendor. A last check
// dated far ahead keeps the check from falling due, so none is ever made.
const NEVER_DUE = new Date('2100-01-01T00:00:00Z')

/** Adds the organisation's provider of this vendor unless it has one; returns the row. */
export async function addFakeProvider(db, hqRoot, { vendor, name, baseUrl = null }) {
  const existing = await db.aiProvider.findFirst({ where: { vendor, ownerUserId: null } })
  if (existing) return existing
  return db.aiProvider.create({
    data: {
      name, vendor, credentialKind: 'api_key', baseUrl, secret: encryptSecret(FAKE_KEY, hqMasterKey(hqRoot)),
      keyHint: FAKE_KEY.slice(-4), state: 'works', lastCheckedAt: NEVER_DUE, lastWorkedAt: new Date(),
    },
  })
}
