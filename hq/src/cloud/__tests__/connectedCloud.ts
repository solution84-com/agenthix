/**
 * An hq connected to the stand-in Cloud, its stores in memory, for the tests of what the connection carries: signing
 * in with an Agenthix account and the downtime email.
 */
import { generateCloudConnectionKeys, type CloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { cloudClient } from '../cloudClient'
import { CloudConnection, type StoredCloudConnection } from '../cloudConnection'
import { CloudStandIn } from './cloudStandIn'

export async function connectedCloud(options: { connect?: boolean } = {}) {
  let now = Date.UTC(2026, 0, 1)
  const timers: { at: number; run: () => void; live: boolean }[] = []
  const cloud = new CloudStandIn(() => now)
  let stored: StoredCloudConnection | null = null
  let keys: CloudConnectionKeys | null = null
  const events: string[] = []
  const connection = new CloudConnection({
    client: cloudClient(cloud.base, cloud.fetch, () => now),
    connections: { read: async () => stored, write: async c => { stored = c }, clear: async () => { stored = null } },
    keys: { read: async () => keys, create: async () => (keys = await generateCloudConnectionKeys()), clear: async () => { keys = null } },
    about: async () => ({ organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }),
    onEnding: async () => { events.push(`ending, ${cloud.requests.filter(r => r.path === '/connect/revoke').length} revoked`) },
    onDisconnected: async (_c, by) => { events.push(`disconnected by ${by}`) },
    now: () => now,
    schedule: (run, ms) => {
      const t = { at: now + ms, run, live: true }
      timers.push(t)
      return () => { t.live = false }
    },
  })
  if (options.connect !== false) {
    const { userCode } = await connection.connect('u-admin')
    cloud.approve(userCode)
    now += 5_000
    for (const t of timers.filter(x => x.live && x.at <= now)) { t.live = false; t.run() }
    // The poll signs with Web Crypto, which finishes off the main thread: wait for it, a little at a time.
    for (let i = 0; i < 400 && !stored; i++) await new Promise(r => setTimeout(r, 5))
    if (!stored) throw new Error('the stand-in connection did not complete')
  }
  return {
    cloud, connection, events,
    clientId: () => stored?.clientId ?? null,
    privateKey: () => keys?.privateKey ?? null,
    advance: (ms: number) => { now += ms },
    now: () => now,
  }
}
