import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BRANDING } from '@agenthix/core'
import type { CrumbList, PlaceNav } from './placeNavTypes'
import { CrumbListMenu } from './CrumbLists'

export interface Breadcrumb {
  label: string
  href?: string
  /** Drilled into a place, the part opens this list instead of being a link. */
  list?: CrumbList
}

const PRODUCT: string = BRANDING.displayName

/** The browser tab's title: the last two crumbs, the most specific first, then the product. */
export function documentTitle(breadcrumbs: Breadcrumb[]): string {
  return [...breadcrumbs.slice(-2).map((c) => c.label).reverse(), PRODUCT].join(' · ')
}

/**
 * The slim bar across the top of each screen's content: the breadcrumb on the left,
 * and on the right whatever the screen puts there (a place's layout control).
 */
export function ScreenBar({ breadcrumbs = [], right, placeNav = null }: { breadcrumbs?: Breadcrumb[]; right?: ReactNode; placeNav?: PlaceNav | null }) {
  return (
    <div
      data-testid="screen-bar"
      className="hidden lg:flex h-10 shrink-0 items-center gap-3 px-6 border-b border-border-subtle bg-surface-1"
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 flex-1 text-small leading-[18px]">
        {breadcrumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className="text-text-muted shrink-0">/</span>}
            {crumb.list ? (
              <CrumbListMenu crumb={crumb} list={crumb.list} placeNav={placeNav} current={i === breadcrumbs.length - 1} />
            ) : crumb.href ? (
              <Link to={crumb.href} className="text-accent hover:text-accent-hover truncate">
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={i === breadcrumbs.length - 1 ? 'page' : undefined}
                className="text-text-muted truncate"
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>
      <div data-testid="screen-bar-right" className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  )
}
