import type { ReactNode } from 'react'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { AgenthixMark } from './BrandSide'
import { heroOf, initialOf, type ShownIdentity } from './orgCard'
import { BRANDING } from '@agenthix/core'

// Organisation images are fetched from hq's own address (in development not the page's), as the Organisation page's are;
// the fetch carries the session when there is one, and a signed-out visitor gets the files the sign-in page shows.
function Picture({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  return (
    <span className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface-1 bg-surface-1 text-display font-bold text-accent shadow-lg">
      {initialOf(name)}
      {avatarUrl && <AuthedImg src={avatarUrl} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  )
}

/**
 * The organisation across the top (getting-in spec, Signing in): a cover banner,
 * its picture overlapping the banner's lower edge, then the name, handle and
 * vision, centred. Never our logo; before a cover is set, a plain cover with
 * the organisation's initial. When the admin chose to show the name only, just
 * the name.
 */
export function OrgCover({ identity }: { identity: ShownIdentity }) {
  if (identity.shows === 'name') {
    return (
      <div className="px-5 pt-12 text-center" data-testid="org-cover">
        <div className="text-h2 font-bold text-text-primary">{identity.name}</div>
      </div>
    )
  }
  return (
    <div data-testid="org-cover">
      <div className="relative h-28 overflow-hidden bg-accent lg:h-[180px]" data-testid="org-cover-banner">
        {identity.coverUrl && <AuthedImg src={identity.coverUrl} className="absolute inset-0 h-full w-full object-cover" />}
      </div>
      <div className="-mt-9 flex flex-col items-center px-5 text-center">
        <Picture name={identity.name} avatarUrl={identity.avatarUrl} />
        <div className="mt-3 max-w-full truncate text-h2 font-bold text-text-primary">{identity.name}</div>
        {identity.handle && <div className="text-small text-text-muted">@{identity.handle}</div>}
        {identity.vision && <p className="mt-2 max-w-[440px] text-body text-text-secondary">{identity.vision}</p>}
      </div>
    </div>
  )
}

/** A cover that is not an organisation's: a plain panel saying where the person is (setup, before there is an identity). */
export function PlainSide({ title, children, mark }: { title: string; children?: ReactNode; mark?: ReactNode }) {
  return (
    <div className="relative bg-surface-3 px-5 py-6 text-text-primary lg:flex lg:min-h-screen lg:flex-col lg:justify-end lg:px-10 lg:py-9">
      {mark && <div className="mb-3">{mark}</div>}
      <div className="text-h2 font-bold lg:text-display">{title}</div>
      {children && <div className="mt-2 max-w-[440px] text-body text-text-secondary lg:text-reading">{children}</div>}
    </div>
  )
}

/**
 * The shared shape of every way in, in one column: the organisation across the
 * top, the form centred on white under it, "Powered by Agenthix" at the foot.
 * With nothing to show, the form stands alone. A `side` (setup's own panel)
 * keeps the two-column arrangement: the form on the left, the panel on the right (below the form on a phone).
 */
export function AuthLayout({ identity, side, aside, contained, setup, children }: { identity?: ShownIdentity | null; side?: ReactNode; /** Onboarding: the organisation's cover across the top, then the form with something useful beside it (below it on a phone). */ aside?: ReactNode; /** Setup of a fresh HQ: our mark and name head the form and there is no "Powered by" footer, as the HQ is not yet the organisation's. */ setup?: boolean; /** Drawn inside a frame (setup's preview), not filling the screen. */ contained?: boolean; children: ReactNode }) {
  const hero = heroOf(identity ?? null)
  const form = (
    <>
      {setup && (
        <div data-testid="setup-brand" className="mx-auto mb-8 flex w-full max-w-[400px] items-center gap-2.5 text-accent">
          <AgenthixMark className="h-8 w-8" />
          <span className="text-h2 font-bold text-text-primary">{BRANDING.displayName}</span>
        </div>
      )}
      <div className="mx-auto w-full max-w-[400px]">{children}</div>
      {!setup && <p className="mt-10 text-center text-small text-text-muted">Powered by {BRANDING.displayName}</p>}
    </>
  )
  if (aside) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-1">
        {hero && <OrgCover identity={hero} />}
        <main className={`mx-auto grid w-full max-w-[920px] flex-1 content-start gap-8 px-5 lg:grid-cols-2 lg:gap-12 ${hero ? 'pt-8' : 'pt-9'}`}>
          <div className="mx-auto w-full max-w-[400px]">{children}</div>
          <div className="mx-auto w-full max-w-[400px] lg:max-w-none">{aside}</div>
        </main>
        <p className="py-9 text-center text-small text-text-muted">Powered by {BRANDING.displayName}</p>
      </div>
    )
  }
  if (side) {
    return (
      <div className="min-h-screen bg-surface-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main className="flex min-h-[60vh] flex-col justify-center px-5 py-9 lg:min-h-screen lg:px-11">{form}</main>
        {side}
      </div>
    )
  }
  return (
    <div className={`flex ${contained ? 'min-h-full' : 'min-h-screen'} flex-col bg-surface-1`}>
      {hero && <OrgCover identity={hero} />}
      <main className={`flex flex-1 flex-col px-5 pb-9 ${hero ? 'pt-8' : 'justify-center pt-9'}`}>
        <div className="my-auto">{form}</div>
      </main>
    </div>
  )
}
