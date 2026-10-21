/**
 * The secrets an install of hq and its default site needs, made once and kept in the state folder. A value
 * already there is never replaced, so running `install` again changes nothing that works.
 */
import crypto from 'node:crypto'
import type { StateFolder } from './folder'

export type InstallSecrets = {
  hqDbPassword: string
  jwtSecret: string
  hqMasterKey: string
  /** One value set in both hq's and the site's environment (adr-0070). */
  pairingSecret: string
  siteDbPassword: string
  siteMasterKey: string
  /** One value set in hq-server's and its Fleet Console's environment (spec §4 C8). */
  consolePairingSecret: string
}

const KEYS: (keyof InstallSecrets)[] = ['hqDbPassword', 'jwtSecret', 'hqMasterKey', 'pairingSecret', 'siteDbPassword', 'siteMasterKey', 'consolePairingSecret']

const hex = (n: number) => crypto.randomBytes(n).toString('hex')
const base64 = (n: number) => crypto.randomBytes(n).toString('base64')

function fresh(): InstallSecrets {
  return {
    hqDbPassword: hex(24),
    jwtSecret: hex(32),
    hqMasterKey: base64(32),
    pairingSecret: hex(32),
    siteDbPassword: hex(24),
    siteMasterKey: base64(32),
    consolePairingSecret: hex(32),
  }
}

export function installSecrets(state: StateFolder): InstallSecrets {
  const stored = (state.readJson('secrets.json') ?? {}) as Partial<Record<keyof InstallSecrets, unknown>>
  const made = fresh()
  const out = {} as InstallSecrets
  let changed = false
  for (const key of KEYS) {
    const v = stored[key]
    if (typeof v === 'string' && v.length > 0) out[key] = v
    else {
      out[key] = made[key]
      changed = true
    }
  }
  if (changed) state.writeJson(['secrets.json'], out)
  return out
}
