import { AppLayout } from '../../shared/layouts/AppLayout'

function Coming({ title, line }: { title: string; line: string }) {
  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: title }]}>
      <div className="max-w-[760px] px-4 py-9 lg:px-10">
        <h1 className="text-h1 font-semibold text-text-primary">{title}</h1>
        <p className="mt-0.5 text-small text-text-secondary">{line}</p>
        <p className="mt-6 rounded-2xl border border-border-subtle bg-surface-1 p-6 text-body text-text-secondary">This page is coming in this release.</p>
      </div>
    </AppLayout>
  )
}

export const BillingProfilesComingPage = () => <Coming title="Billing profiles" line="Who each project's AI cost belongs to." />
export const UsageComingPage = () => <Coming title="Usage" line="What the organisation's AI use cost, and who used it." />
