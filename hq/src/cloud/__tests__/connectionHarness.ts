/** hq's connection against the stand-in Cloud server, with a clock and timers the test moves on. */
import { generateCloudConnectionKeys, type CloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { cloudClient } from '../cloudClient'
import { CloudConnection, type StoredCloudConnection } from '../cloudConnection'
import { CloudStandIn } from './cloudStandIn'

export function harness(options: ConstructorParameters<typeof CloudStandIn>[1] = {}) {
  let now = Date.UTC(2026, 0, 1)
  const timers: { at: number; run: () => void; live: boolean }[] = []
  const cloud = new CloudStandIn(() => now, options)
  let stored: StoredCloudConnection | null = null
  let keys: CloudConnectionKeys | null = null
  let keysMade = 0
  let address = 'https://hq.acme.example'
  const events: string[] = []
  const connection = new CloudConnection({
    client: cloudClient(cloud.base, cloud.fetch, () => now),
    connections: { read: async () => stored, write: async c => { stored = c }, clear: async () => { stored = null } },
    keys: {
      read: async () => keys,
      create: async () => { keysMade++; keys = await generateCloudConnectionKeys(); return keys },
      clear: async () => { keys = null },
    },
    about: async () => ({ organisationName: 'Acme Robotics', address }),
    onConnected: async (c, by) => { events.push(`connected ${c.name} by ${by}`) },
    onDisconnected: async (c, by) => { events.push(`disconnected ${c.name} by ${by}`) },
    now: () => now,
    schedule: (run, ms) => {
      const t = { at: now + ms, run, live: true }
      timers.push(t)
      return () => { t.live = false }
    },
  })
  /**
   * Waits for the work a timer queued to finish. A poll signs with real crypto, which a slow machine finishes after
   * any fixed number of event-loop turns, so this waits on the connection's own queue instead.
   */
  async function settled() {
    let queued: Promise<unknown>
    do {
      queued = connection['queue']
      await queued
    } while (queued !== connection['queue'])
  }
  /** Moves the clock on and runs every timer due, letting each poll finish before the next. */
  async function advance(ms: number) {
    const until = now + ms
    for (;;) {
      const due = timers.filter(t => t.live && t.at <= until).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      due.live = false
      now = due.at
      due.run()
      await settled()
    }
    now = until
  }
  return {
    cloud, connection, events, advance,
    stored: () => stored, keys: () => keys, keysMade: () => keysMade,
    setNow: (t: number) => { now = t },
    /** hq's configured address, as a restart with a new `HQ_URL` would change it. */
    setAddress: (a: string) => { address = a },
  }
}
