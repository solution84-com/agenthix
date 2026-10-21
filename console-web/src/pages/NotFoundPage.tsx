import { EmptyState } from '@agenthix/ui/primitives'
import { PageHeading } from '../components'
import { Link } from '../router'
import { HOME } from '../shell/menu'

export function NotFoundPage() {
  return (
    <>
      <PageHeading title="No such page" />
      <EmptyState
        title="Nothing is at this address in the Fleet Console."
        action={<Link to={HOME} className="text-small font-semibold text-text-primary underline">Go to the dashboard</Link>}
      />
    </>
  )
}
