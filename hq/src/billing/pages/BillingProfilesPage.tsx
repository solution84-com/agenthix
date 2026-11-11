import { useState } from 'react'
import { useQuery, getBillingProfiles } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ArchiveProfileDialog, NewProfileDialog, RenameProfileDialog } from '../components/ProfileDialogs'
import { ProfileLine } from '../components/ProfileLine'
import { BASIS_WORDS } from '../components/costWords'
import { useBackgroundRead } from '@agenthix/ui/attention'

type Open = { kind: 'rename' | 'archive'; id: string } | null

/** Who each project's AI cost belongs to. Organisation admins only; the server refuses anyone else. */
export function BillingProfilesPage() {
  const query = useQuery(getBillingProfiles)
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The billing profiles' })
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const active = data?.profiles.filter(p => !p.archivedAt) ?? []
  const archived = data?.profiles.filter(p => p.archivedAt) ?? []
  const chosen = open ? data?.profiles.find(p => p.id === open.id) : undefined
  const close = () => setOpen(null)

  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: 'Billing profiles' }]}>
      <div className="max-w-[860px] px-4 py-9 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-medium text-text-primary">Billing profiles</h1>
            <p className="mt-0.5 text-small text-text-secondary">Who each project&rsquo;s AI cost belongs to. Everything that names none uses the default.</p>
          </div>
          <Button onClick={() => setAdding(true)} disabled={!data}>New billing profile</Button>
        </div>

        {read.nudge}
        {!data && !read.failedWithoutData && <p className="mt-6 text-small text-text-muted">Loading…</p>}
        {data && (
          <>
            <ul className="mt-6 space-y-3" aria-label="Billing profiles">
              {active.map(p => <ProfileLine key={p.id} profile={p} onRename={() => setOpen({ kind: 'rename', id: p.id })} onArchive={() => setOpen({ kind: 'archive', id: p.id })} />)}
            </ul>
            <p className="mt-4 text-small text-text-muted">
              {BASIS_WORDS.ACTUAL.label}: through Agenthix Cloud. {BASIS_WORDS.ESTIMATED.label}: your own providers&rsquo; keys, from list prices.
            </p>
            {archived.length > 0 && (
              <section className="mt-8" aria-label="Archived billing profiles">
                <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">Archived</h2>
                <ul className="mt-2 space-y-1">
                  {archived.map(p => (
                    <li key={p.id} className="text-body text-text-secondary">
                      {p.name} <span className="text-small text-text-muted">· archived {new Date(p.archivedAt as string).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}. Its costs stay on reports.</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {data && <NewProfileDialog open={adding} profiles={data.profiles} onClose={() => setAdding(false)} />}
      {data && chosen && open?.kind === 'rename' && <RenameProfileDialog profile={chosen} onClose={close} />}
      {data && chosen && open?.kind === 'archive' && <ArchiveProfileDialog profile={chosen} others={data.profiles} onClose={close} />}
    </AppLayout>
  )
}
