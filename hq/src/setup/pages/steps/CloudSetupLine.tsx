import { useQuery, getWhereHqRuns } from 'wasp/client/operations'

/**
 * Setup mentions Agenthix Cloud once: one sentence under *Where agents run*, with no action. Not on an HQ that Cloud
 * runs, where it would read as an offer for what it already has.
 */
export function CloudSetupLine() {
  const { data } = useQuery(getWhereHqRuns)
  if (!data || data.hosting === 'cloud') return null
  return (
    <p className="mt-1.5 text-small text-text-muted">
      Agenthix Cloud can also run sites for you on its machines; a fleet admin can connect it later, in the Fleet Console.
    </p>
  )
}
