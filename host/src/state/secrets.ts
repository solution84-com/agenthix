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
  /** One value set in hq-server's and hq's relay's environment (adr-0153); at least 32 characters. */
  relaySecret: string
}

const KEYS: (keyof InstallSecrets)[] = ['hqDbPassword', 'jwtSecret', 'hqMasterKey', 'pairingSecret', 'siteDbPassword', 'siteMasterKey', 'consolePairingSecret', 'relaySecret']

/** Keys whose loss would leave stored data unreadable, by the install that holds that data. */
const PROTECTS: { here: 'hq' | 'site'; keys: (keyof InstallSecrets)[]; what: string }[] = [
  { here: 'hq', keys: ['hqMasterKey', 'hqDbPassword'], what: "HQ's" },
  { here: 'site', keys: ['siteMasterKey', 'siteDbPassword'], what: "the site's" },
]

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
    relaySecret: hex(32),
  }
}

export function installSecrets(state: StateFolder): InstallSecrets {
  const stored = (state.readJson('secrets.json') ?? {}) as Partial<Record<keyof InstallSecrets, unknown>>
  const installedHere = { hq: state.readJson('hq', 'settings.json') !== null, site: state.readJson('site', 'settings.json') !== null }
  for (const { here, keys, what } of PROTECTS) {
    if (!installedHere[here]) continue
    const missing = keys.filter(k => typeof stored[k] !== 'string' || stored[k] === '')
    if (missing.length) {
      throw new Error(`${what} ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing from secrets.json, though it is installed here. Making a new one would lock its data. Restore secrets.json from a backup. Nothing was changed.`)
    }
  }
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
