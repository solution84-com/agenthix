import { useState, type ReactNode } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useAction, getOrgPerson, removePerson } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { firstName } from '@agenthix/ui/people'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { OrgPeopleGate } from './OrgPeopleGate'
import { RemoveDestinationRow } from './RemoveDestinationRow'
import { removalDestinations, type OpenTasksChoice } from './peopleFormat'

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">{children}</h2>
}

function Lines({ items }: { items: ReactNode[] }) {
  return <div className="space-y-1.5 text-body text-text-secondary">{items.map((i, n) => <p key={n}>{i}</p>)}</div>
}

function RemovePerson({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const { data: view, error: loadError } = useQuery(getOrgPerson, { userId })
  const remove = useAction(removePerson)
  const [chosen, setChosen] = useState<Record<string, OpenTasksChoice | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const crumbs = (last: string) => [ADMIN_CRUMB, { label: 'People', href: '/admin/people' }, { label: last }]

  if (!view) {
    return <AppLayout breadcrumbs={crumbs('Remove')}><div className="px-6 py-16 text-center text-text-muted">{loadError ? loadError.message : 'Loading…'}</div></AppLayout>
  }
  const { person } = view
  const withTasks = view.projects.filter(p => p.openTaskCount > 0)
  const destinations = removalDestinations(view.projects, chosen)

  if (person.state !== 'active' || view.isMe) {
    return (
      <AppLayout breadcrumbs={crumbs(person.name)}>
        <div className="px-6 py-16 text-center text-text-muted">
          {view.isMe ? 'You cannot remove your own account.' : `${person.name} has already left.`}{' '}
          <Link to={`/admin/people/${userId}`} className="text-accent hover:text-accent-hover">Back</Link>
        </div>
      </AppLayout>
    )
  }

  async function submit() {
    if (!destinations) return
    setBusy(true)
    setError(null)
    try {
      await remove({ userId, openTasks: destinations })
      navigate(`/admin/people/${userId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const first = firstName(person.name)
  const doneOnBehalf = view.projects.reduce((n, p) => n + p.openTaskCount, 0)
  return (
    <AppLayout
      breadcrumbs={crumbs(`Remove ${person.name}`)}
      title={`Remove ${person.name} from the organisation`}
      subtitle={`${first} can be brought back. Nothing is deleted.`}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-10 gap-y-8 px-4 py-6 lg:grid-cols-2 lg:px-8">
        <div className="space-y-6">
          <section aria-label="What happens at once">
            <Heading>At once</Heading>
            <Lines items={[
              'Sign-in ends, on every device and connection',
              `${first} leaves ${view.projects.length + view.privateProjectCount} ${view.projects.length + view.privateProjectCount === 1 ? 'project' : 'projects'}; ${first}'s own model logins stop being used`,
            ]} />
          </section>
          <section aria-label="Their open tasks">
            <Heading>Open tasks{doneOnBehalf > 0 && ` · ${doneOnBehalf} done on ${first}'s behalf`}</Heading>
            {withTasks.length === 0 ? (
              <p className="py-1 text-body text-text-secondary">No project you can see has tasks done on their behalf.</p>
            ) : (
              <>
                <p className="py-1 text-body text-text-secondary">Choose, for each project, who the open tasks are done on behalf of now. Tasks left waiting do not run until someone takes them on.</p>
                <ul className="divide-y divide-border-subtle">
                  {withTasks.map(p => (
                    <RemoveDestinationRow key={p.id} project={p} personId={userId} personName={person.name} choice={chosen[p.id]} onChoose={c => setChosen(s => ({ ...s, [p.id]: c }))} />
                  ))}
                </ul>
              </>
            )}
            {view.privateProjectCount > 0 && (
              <p className="mt-2 text-small text-text-muted">In {view.privateProjectCount} private {view.privateProjectCount === 1 ? 'project' : 'projects'} you are not in, their open tasks wait.</p>
            )}
          </section>
          <section aria-label="What is kept">
            <Heading>Kept</Heading>
            <Lines items={[
              `${first}'s name on tasks, comments, messages and runs, shown as ${person.name} · left`,
              `${first}'s private conversations and personal files stay private: no one, admins included, can open them`,
            ]} />
          </section>
          {error && <p role="alert" className="text-body text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button variant="danger" disabled={!destinations || busy} onClick={() => void submit()}>{busy ? 'Removing…' : `Remove ${person.name}`}</Button>
            <Link to={`/admin/people/${userId}`} className="text-body text-text-secondary hover:text-text-primary">Cancel</Link>
            {!destinations && <span className="text-small text-text-muted">Choose for every project first.</span>}
          </div>
        </div>
        <section aria-label="Afterwards" className="space-y-3">
          <Heading>Afterwards, on {first}'s page</Heading>
          <Lines items={[
            <><b className="font-medium text-text-primary">Reactivate</b>: the same account comes back with all its history; projects are added again by hand</>,
            <><b className="font-medium text-text-primary">Erase</b>: for a data-protection request, or when the organisation no longer needs it. Deleted: private conversations, personal project and files, memory, connections, model logins, name and picture. Stays with the projects: tasks, comments and task runs, the name replaced by <b className="font-medium text-text-primary">Former member</b>. It cannot be undone and asks for the person's name to be typed.</>,
          ]} />
          <p className="text-small text-text-muted">People who left are under "Left" at the foot of Organisation › People. They are not counted and not offered in pickers.</p>
        </section>
      </div>
    </AppLayout>
  )
}

export function RemovePersonPage() {
  const { userId } = useParams<{ userId: string }>()
  return <OrgPeopleGate><RemovePerson userId={userId!} /></OrgPeopleGate>
}
