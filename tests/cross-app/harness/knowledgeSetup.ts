// What a suite that runs a conversation over knowledge needs before it starts, whether it runs after the others or
// alone: hq paired with its own default site, and the platform guide built where hq reads it.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { HQ_ROOT, HQ_URL } from './env'
import { hqDb, siteDb } from './db'
import { until } from './hqApi'
import { startHq, startSite, stopHq, stopSite, waitForHq, waitForSite } from './apps'

// Fixed test value, 64 hex characters, used only against the harness's own test databases; another literal than the
// other suites', so nothing couples them.
const PAIRING_SECRET = 'cafe0007'.repeat(8)

/**
 * Leaves hq paired with its own default site, online. After 04-pairing the pair is already there and nothing is
 * restarted; run alone, the site's identity is wiped and both apps restart with one pairing secret, as 02-dispatch
 * pairs its own.
 */
export async function ensureDefaultSite(): Promise<void> {
  if (await hqDb.executionSite.findFirst({ where: { isDefault: true, status: 'ONLINE' } })) return
  await Promise.all([stopHq(), stopSite()])
  await siteDb.hqConnection.deleteMany()
  await siteDb.siteConfig.deleteMany()
  await startHq({ pairingSecret: PAIRING_SECRET })
  await waitForHq()
  await startSite({ pairingSecret: PAIRING_SECRET, hqUrl: HQ_URL })
  await waitForSite()
  await until(
    async () => hqDb.executionSite.findFirst({ where: { isDefault: true, status: 'ONLINE' } }),
    'hq to pair its own default site',
    180_000,
  )
}

/**
 * Builds the platform guide into hq's assets folder (gitignored), as hq's dev start and its image do; `wasp start`
 * alone does not. hq looks for it on every search, so a running hq finds it without a restart.
 */
export function buildPlatformGuide(): void {
  // Built once before the run by a caller running several suites at once (globalSetup.ts, CROSSAPP_PREBUILT).
  if (process.env.CROSSAPP_PREBUILT === '1') return
  const r = spawnSync(process.execPath, [join('scripts', 'guide', 'build-platform-guide.mjs')], { cwd: HQ_ROOT, encoding: 'utf8', timeout: 120_000 })
  if (r.status !== 0) throw new Error(`the platform guide did not build: ${r.stderr || r.stdout}`)
}
