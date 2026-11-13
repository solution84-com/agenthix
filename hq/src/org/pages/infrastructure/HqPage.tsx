import type { ReactNode } from 'react'
import { useQuery, getVersionInfo, getEnvStatus, getWhereHqRuns } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'
import { InstallationIdentity } from './InstallationIdentity'
import { REQUIRED_LABELS } from './envFacts'
import { BRANDING } from '@agenthix/core'

function Block({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="bg-surface-1 border border-border rounded-xl p-6 lg:p-8">
      <h2 className="text-text-primary font-medium mb-1">{title}</h2>
      {description && <p className="text-text-muted text-body mb-5">{description}</p>}
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-micro text-text-muted">{label}</span>
      <span className="font-mono text-micro text-text-secondary truncate">{value}</span>
    </div>
  )
}

/** Why HQ offers uploaded files only as downloads (adr-0114), and what changes it. */
export function downloadsOnlySentence(bareAddress: boolean): string {
  const why = bareAddress
    ? 'HQ is at an address that can have no subdomain — a network address or a one-word machine name — so uploaded files cannot have an address of their own.'
    : 'Uploaded files have no address of their own (FILES_ORIGIN is not set).'
  return `${why} HQ offers them only as downloads, never shown in the browser, so that a file someone uploaded cannot act as HQ. Give HQ a host name, with one for files beside it, to show pictures and documents in place.`
}

/** Organisation › Infrastructure › HQ: this installation, its build, its address and its environment. */
export function HqPage() {
  return (
    <OrgAdminPage area="infrastructure" title="HQ" wide>
      <OrgAdminHeading title="HQ">This installation of {BRANDING.displayName}: the server everyone signs in to.</OrgAdminHeading>
      <HqDetails />
    </OrgAdminPage>
  )
}

function HqDetails() {
  const { data: version } = useQuery(getVersionInfo)
  const { data: env } = useQuery(getEnvStatus)
  const { data: hosting } = useQuery(getWhereHqRuns)

  return (
    <div className="space-y-8">
      {hosting && (
        <Block title="Where HQ runs" description="The machine everyone signs in through, and who looks after it.">
          <Fact label="Runs on" value={hosting.hosting === 'cloud' ? 'Agenthix Cloud' : 'Self-hosted'} />
          <Fact label="Agenthix Cloud" value={hosting.connectedAs ? `Connected as ${hosting.connectedAs}` : hosting.hosting === 'cloud' ? 'Runs HQ' : 'Not connected'} />
          <p className="mt-3 text-small text-text-muted">
            {hosting.hosting === 'cloud'
              ? 'Agenthix Cloud keeps HQ up to date and backed up.'
              : "Agenthix Cloud can run HQ and its sites on its own machines, kept up to date and backed up. Fleet admins connect the organisation to it on HQ's page in the Fleet Console."}
          </p>
        </Block>
      )}

      <Block title="This installation" description="Its name and description.">
        <InstallationIdentity />
      </Block>

      {version && (
        <Block title="Version" description="Build info for the running server.">
          <Fact label="Version" value={version.version} />
          <Fact label="Built" value={new Date(version.built).toLocaleString()} />
        </Block>
      )}

      {env && (
        <Block
          title="Address and environment"
          description="Where browsers and every site's machine reach HQ, and which settings its server has. Values are never shown — only whether each key is set."
        >
          <Fact label="Address" value={env.address ?? 'Not set'} />
          <Fact label="Uploaded files" value={env.files.mode === 'origin' ? env.files.origin : 'Downloads only'} />
          {env.files.mode === 'downloadsOnly' && <p className="text-small text-text-muted mt-2">{downloadsOnlySentence(env.files.bareAddress)}</p>}
          <div className="mt-6 space-y-6">
            {env.sections.map(section => (
              <div key={section.label}>
                <p className="text-micro font-medium uppercase tracking-wide text-text-muted mb-2">{section.label}</p>
                {section.keys.map(({ key, set, required }) => (
                  <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="font-mono text-micro text-text-secondary">{key}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-micro text-text-muted">{REQUIRED_LABELS[required] ?? required}</span>
                      <span className={`text-micro font-medium ${set ? 'text-success' : 'text-text-muted'}`}>{set ? '● Set' : '○ Not set'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  )
}
