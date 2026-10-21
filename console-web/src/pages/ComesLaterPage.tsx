import { EmptyState } from '@agenthix/ui/primitives'
import { PageHeading } from '../components'

/** A menu item whose screen is not built yet: it still opens inside the shell, and says so. */
export function ComesLaterPage({ title }: { title: string }) {
  return (
    <>
      <PageHeading title={title} />
      <EmptyState title="This screen comes later." hint="It is being built; the rest of the Fleet Console works meanwhile." />
    </>
  )
}
