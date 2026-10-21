import type { ReactNode } from 'react'
import { backupsOffMachine } from './dashboardWords'
import type { Overview } from './overview'
import type { FleetHost } from './types'

export function Tile({ label, value, small = false, warn = false, children }: { label: string; value: string; small?: boolean; warn?: boolean; children: ReactNode }) {
  return (
    <div className={`rounded-[14px] border bg-card px-4 py-3 ${warn ? 'border-warning/45' : 'border-border'}`}>
      <p className="text-micro font-semibold uppercase tracking-[.06em] text-text-muted">{label}</p>
      <p className={`mt-1 font-bold text-text-primary ${small ? 'text-h3' : 'text-h1'}`}>{value}</p>
      <p className="mt-0.5 text-micro text-text-secondary">{children}</p>
    </div>
  )
}

/** The fleet's totals, under the fleet (board *Proposal*, 6): agents running, the next maintenance, backups kept off their machine. */
export function Totals({ overview, hosts, children }: { overview: Overview; hosts: readonly FleetHost[]; children?: ReactNode }) {
  const { agents, next } = overview
  const backups = backupsOffMachine(hosts)
  return (
    <section aria-label="Totals" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      <Tile label="Agents running" value={agents.sites === 0 ? '—' : `${agents.running} of ${agents.capacity}`}>
        {agents.sites === 0
          ? 'HQ has not said yet'
          : `Room for ${Math.max(0, agents.capacity - agents.running)} more on ${agents.sites} ${agents.sites === 1 ? 'site' : 'sites'}`}
      </Tile>
      <Tile label="Next maintenance" value={next ? next.when : 'None'} small>
        {next ? `${next.what} · ${next.sites.join(', ')}` : 'Nothing is planned'}
      </Tile>
      <Tile label="Backups" value={backups.total === 0 ? '—' : `${backups.off} of ${backups.total}`} small warn={backups.off < backups.total}>
        {backups.total === 0 ? 'No figures yet' : 'kept off their machine, in a backup location'}
      </Tile>
      {children}
    </section>
  )
}
