import type { ReactNode } from 'react'
import type { SiteDetail } from '../siteViews'
import { SECTION_LABEL } from './SiteGroupSection'
import { plural } from './siteWords'
import { Link } from 'react-router'
import { figureFacts, limitFacts, loadText, scheduledSentence, WHO_ACTS, causeExplanation } from './whereWorkRunsWords'
import { hostingLabel } from '@agenthix/ui/primitives'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-8">
      <h2 className={`${SECTION_LABEL} mb-1`}>{title}</h2>
      <div className="divide-y divide-border-subtle border-y border-border-subtle">{children}</div>
    </section>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <div className="w-44 shrink-0 text-small text-text-muted">{label}</div>
      <div className="min-w-0 flex-1 text-small text-text-primary">{children}</div>
    </div>
  )
}

/** Why hq's own site is not connected, in full, and who acts. */
export function WhyNotConnected({ site }: { site: SiteDetail }) {
  return (
    <div className="mb-8 rounded-[10px] border border-border bg-surface-1 px-4 py-3 text-small">
      <p className="text-text-primary">{causeExplanation(site.cause, site.lastSeenAt)}</p>
      <p className="mt-1 text-text-secondary">{WHO_ACTS} Your fleet admins have been told.</p>
    </div>
  )
}

/** What a site that is not connected stops: the projects that cannot run, and the runs that wait for it. */
export function WhatThisStops({ site }: { site: SiteDetail }) {
  const names = site.projects.map((p) => p.name).join(', ')
  const hidden = site.hiddenProjects > 0 ? `${site.projects.length ? ' and ' : ''}${plural(site.hiddenProjects, 'private project')}` : ''
  return (
    <Section title="What this stops">
      <Fact label={`Projects · ${site.projectCount}`}>
        {site.projectCount === 0 ? 'None' : `${names}${hidden} can't run or open their files`}
      </Fact>
      <Fact label="Waiting for it">{site.waiting.runs === 0 ? 'No runs' : `${plural(site.waiting.runs, 'run')}, starting when it connects`}</Fact>
    </Section>
  )
}

export function Now({ site }: { site: SiteDetail }) {
  const load = loadText(site)
  const waiting = site.connected ? site.waiting.atCapacity ?? 0 : site.waiting.runs
  return (
    <Section title="Now">
      <Fact label={load ? `Runs going · ${site.load!.running} of ${site.load!.maxAtOnce}` : 'Runs going'}>
        {site.runningTasks.length === 0
          ? 'Nothing running'
          : site.runningTasks.map((t) => `${t.key} ${t.title}`).join(' · ')}
      </Fact>
      {waiting > 0 && (
        <Fact label="Waiting for a place">
          {site.connected
            ? `${plural(waiting, 'run')}, in the order they were asked. They start as runs finish.`
            : `${plural(waiting, 'run')}, starting when it connects.`}
        </Fact>
      )}
    </Section>
  )
}

export function Limits({ site }: { site: SiteDetail }) {
  const c = site.load?.ceilings?.ceilings
  if (!c) return null
  const { memory, processors } = limitFacts(c)
  return (
    <Section title="Limits each run gets">
      <Fact label="Memory">{memory}</Fact>
      <Fact label="Processors">{processors}</Fact>
    </Section>
  )
}

export function OnIt({ site }: { site: SiteDetail }) {
  const hidden = site.hiddenProjects > 0 ? ` and ${plural(site.hiddenProjects, 'private project')}` : ''
  return (
    <Section title="On it">
      <Fact label={`Projects · ${site.projectCount}`}>
        {site.projectCount === 0 ? 'None — no project keeps its files or runs here' : `${site.projects.map((p) => p.name).join(', ')}${hidden}`}
      </Fact>
    </Section>
  )
}

export function ScheduledChanges({ site, zone }: { site: SiteDetail; zone: string }) {
  return (
    <Section title="Scheduled maintenance">
      {site.scheduled ? (
        <Fact label="Scheduled">{scheduledSentence(site.scheduled, zone)}</Fact>
      ) : (
        <Fact label="None scheduled">Members are told on their projects when maintenance is scheduled.</Fact>
      )}
    </Section>
  )
}

export function About({ site }: { site: SiteDetail }) {
  return (
    <Section title="About it">
      <Fact label="Runs on">{hostingLabel(site.hosting)}</Fact>
    </Section>
  )
}

/** A fleet admin's view of the machine, under the sentence: figures, versions and where its logs are. Not drawn for anyone else. */
export function MachineFigures({ site }: { site: SiteDetail }) {
  const facts = figureFacts(site)
  if (facts.length === 0) return null
  return (
    <Section title="The machine">
      {facts.map((f) => <Fact key={f.label} label={f.label}>{f.text}</Fact>)}
      <Fact label="Logs"><Link to="/admin/infrastructure/diagnostics" className="text-accent hover:text-accent-hover">Logs and diagnostics</Link></Fact>
    </Section>
  )
}
