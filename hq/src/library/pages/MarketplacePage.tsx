import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, getMarketplace } from 'wasp/client/operations'
import { ReadFailure } from '@agenthix/ui/attention'
import { BRANDING } from '@agenthix/core'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { isDenied, retryUnlessDenied } from '../../projects/place/retryUnlessDenied'

/**
 * The Marketplace's own page (skills spec part 6; adr-0172). It exists only where the `marketplace` flag is on; the
 * server refuses its one read elsewhere, and the page then says it is not there. Where it is on, it says what is
 * not built yet. A read that failed for any other reason opens the dialog, and the page stays empty.
 */
export function MarketplacePage() {
  const { data, error, refetch } = useQuery(getMarketplace, undefined, { retry: retryUnlessDenied })
  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Marketplace' }]} title="Marketplace">
      <div className="mx-auto max-w-2xl px-4 py-8 text-center lg:px-8" data-testid="marketplace-page">
        {error && !isDenied(error) ? (
          <ReadFailure what="The Marketplace" retry={() => void refetch()} error={error} />
        ) : error ? (
          <p className="text-body text-text-secondary">The Marketplace is not available. Nothing was changed.{' '}
            <Link to="/library" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Back to the Library</Link>
          </p>
        ) : data ? (
          <>
            <span className="rounded-full bg-chip px-3 py-1 text-small font-medium text-text-primary">Not available yet</span>
            <p className="mt-4 text-body text-text-secondary">
              The Marketplace is not available yet. When it is, you will find assets other organisations and {BRANDING.displayName} publish
              and add them to the Library. Until then, add one from a file or a link with Add.{' '}
              <Link to="/library" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Back to the Library</Link>
            </p>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
