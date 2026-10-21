import { fireEvent, render, screen } from '@testing-library/react'
import type { HostFigures } from '@agenthix/core'
import { maintenanceAndBackupsScreen } from '../pages/maintenance/routes'
import type { FleetHost } from '../pages/dashboard/types'
import { usePath } from '../router'
import { MaintenancePanelHost } from '../shell/MaintenancePanelHost'

const GB = 1000 ** 3
const NOW = new Date()

/** The page an address names among Maintenance's, with *Plan maintenance* beside it when the address opens it. */
function Harness({ pollMs }: { pollMs?: number }) {
  const path = usePath()
  return <>{maintenanceAndBackupsScreen(path, window.location.search, pollMs)}<MaintenancePanelHost pollMs={pollMs} /></>
}

export function openAt(address: string, pollMs?: number) {
  window.history.replaceState(null, '', address)
  return render(<Harness pollMs={pollMs} />)
}

export const panelAddress = (which?: string, what?: string) =>
  `?panel=maintenance${which ? `&which=${which}` : ''}${what ? `&what=${what}` : ''}`

/** The drop-down `label` (Which, What), by what it shows. */
export const dropDown = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}: `) })

/** Opens the drop-down and chooses `option` (its label, then its tag). */
export function choose(label: string, option: string) {
  fireEvent.click(dropDown(label))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

export const optionsOf = (label: string): string[] => {
  fireEvent.click(dropDown(label))
  const names = screen.getAllByRole('option').map(o => o.getAttribute('aria-label') ?? '')
  fireEvent.click(dropDown(label))
  return names
}

const p = (n: number) => String(n).padStart(2, '0')
export const inDays = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86400_000)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`
}

export const figures = (installs: HostFigures['installs']): HostFigures => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
  resources: { cpuLoad: 0.1, memory: { usedBytes: GB, totalBytes: 32 * GB }, disk: { freeBytes: 100 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * 1024 ** 3, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
  installs,
  backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
  frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null }, scheduledChanges: 0,
})

export const running = (target: 'hq' | 'site') => ({ target, version: '0.2.0', state: 'running' as const, since: NOW.toISOString(), healthy: true, problem: null })

export const fleetHost = (fingerprint: string, machineName: string, over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint, fingerprintShort: fingerprint.slice(0, 4), hostId: machineName, machineName, siteName: machineName, hqMachine: false,
  siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
  figures: figures([running('site')]), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
})
