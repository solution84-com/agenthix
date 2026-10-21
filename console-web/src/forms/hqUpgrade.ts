import { useSyncExternalStore } from 'react'
import type { FleetHost } from '../pages/dashboard/types'

/**
 * An upgrade of HQ asked now, remembered from the moment it was asked until HQ answers on the new version. The Fleet
 * Console reaches HQ's machine through HQ, so while HQ restarts on the new version the answer cannot come back: HQ's
 * page and the upgrade form say so from this, not from an answer. Kept in memory for this tab only.
 */
export type HqUpgradeAsked = { version: string; at: string }

let asked: HqUpgradeAsked | null = null
const listeners = new Set<() => void>()
const tell = () => { for (const l of [...listeners]) l() }

export function noteHqUpgrade(version: string, now = new Date()): void {
  asked = { version, at: now.toISOString() }
  tell()
}

export function forgetHqUpgrade(): void {
  if (!asked) return
  asked = null
  tell()
}

export function useHqUpgrade(): HqUpgradeAsked | null {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => asked)
}

/** Whether HQ answers on the version asked for: then the upgrade is over, whatever answer was lost. */
export function hqUpgradeArrived(a: HqUpgradeAsked, host: FleetHost): boolean {
  const install = host.figures?.installs.find(i => i.target === 'hq')
  return host.online && install?.version === a.version && install.state === 'running'
}
