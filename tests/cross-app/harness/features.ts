/**
 * The organisation's feature switches in the cross-app tier (adr-0172), set through hq's own `setFeature`, as the
 * *Features* screen sets them; hq sends them to the site with each instruction, so the site follows.
 *
 * Every suite runs as shipped: before each file every flag is put at its production value (featuresSetup.ts), since
 * hq runs as a development build here, where a preview or beta would otherwise be on. `TEST_ALL_FEATURES=1`, read
 * only here, switches every flag on instead: the full regression's one run with every feature on.
 */
import { FEATURE_FLAG_NAMES, stageOf, type FeatureFlag } from '../../../core/dist/index.js'
import { HQ_URL } from './env'
import { login, op } from './hqApi'

export const ALL_FEATURES_ENV = 'TEST_ALL_FEATURES'

const ADMIN = { username: 'e2e-admin', password: 'E2eAdmin!2026' }

/** Whether a flag is on as shipped: released only, or every flag in the all-features run. */
export function onAsShipped(flag: FeatureFlag): boolean {
  return process.env[ALL_FEATURES_ENV] === '1' || stageOf(flag) === 'released'
}

export async function setOrgFeature(flag: FeatureFlag, on: boolean): Promise<void> {
  const token = await login(ADMIN.username, ADMIN.password)
  const res = await op(HQ_URL, 'set-feature', { flag, on }, token)
  if (res.status !== 200) throw new Error(`switching ${flag} ${on ? 'on' : 'off'} in hq: ${res.status} ${JSON.stringify(res.json)}`)
}

/** Every flag at its value as shipped (or every flag on, in the all-features run). */
export async function featuresAsShipped(): Promise<void> {
  const token = await login(ADMIN.username, ADMIN.password)
  for (const flag of FEATURE_FLAG_NAMES) {
    const res = await op(HQ_URL, 'set-feature', { flag, on: onAsShipped(flag) }, token)
    if (res.status !== 200) throw new Error(`setting ${flag} as shipped in hq: ${res.status} ${JSON.stringify(res.json)}`)
  }
}
