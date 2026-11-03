import { useQuery, getMarketplace } from 'wasp/client/operations'
import { BRANDING } from '@agenthix/core'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { retryUnlessDenied } from '../../projects/place/retryUnlessDenied'

/**
 * The Marketplace's own page (skills spec part 6; adr-0172). It exists only where the `marketplace` flag is on; the
 * server refuses its one read elsewhere, and the page then says it is not there. Where it is on, it says what is
 * not built yet.
 */
export function MarketplacePage() {
  const { data, error } = useQuery(getMarketplace, undefined, { retry: retryUnlessDenied })
  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: '/library' }, { label: 'Marketplace' }]} title="Marketplace">
      <div className="mx-auto max-w-2xl px-4 py-8 text-center lg:px-8" data-testid="marketplace-page">
        {error ? (
          <p role="alert" className="text-body text-text-secondary">The Marketplace is not available. Nothing was changed.</p>
        ) : data ? (
          <>
            <span className="rounded-full bg-accent-subtle px-3 py-1 text-small font-medium text-accent">Not available yet</span>
            <p className="mt-4 text-body text-text-secondary">
              The Marketplace is not available yet. When it is, you will find assets other organisations and {BRANDING.displayName} publish
              and add them to the Library. Until then, add one from a file or a link with Add.
            </p>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
