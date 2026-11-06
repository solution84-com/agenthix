import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AppShell } from '../../shared/layouts/AppShell'
import type { Breadcrumb } from '../../shared/layouts/ScreenBar'
import type { Place } from '../placeTypes'
import { CONVERSATIONS_SECTION, OVERVIEW_SECTION, chosenSection, sectionHref, toolOfSection } from '../placeSections'
import { usePlaceUrl } from '../usePlaceUrl'
import { PlaceOverview } from './PlaceOverview'
import { PlaceToolView } from './PlaceToolView'
import { TalkButton } from './TalkButton'
import { CardPlaceContext, cardPlaceOf } from '../../agents/profile/cardPlace'
import { drillCrumbs, placeNavOf } from '../placeNav'
import { PlaceDrillMobileHeader } from './PlaceDrillMobileHeader'

function Canvas({ place, section, conversations }: { place: Place; section: string; conversations: ReactNode }) {
  const navigate = useNavigate()
  if (section === CONVERSATIONS_SECTION) return <>{conversations}</>
  const tool = toolOfSection(place, section)
  if (section === OVERVIEW_SECTION || !tool) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {place.overview ?? (
          <div className="w-full max-w-3xl px-4 py-4 lg:px-6 lg:py-5">
            <PlaceOverview place={place} onOpenTool={(id) => navigate(sectionHref(place, id))} />
          </div>
        )}
      </div>
    )
  }
  return <PlaceToolView key={section}>{tool.render()}</PlaceToolView>
}

/**
 * The frame of a place's screens — a project, the person's own space, an agent's page (spec §5–§7): the screen
 * hands the shell the place, whose sections are the left panel's, and the chosen one fills the canvas at full
 * width. The section is the address's `?tool=`; the place's own address opens Overview. *Talk about <place>* sits in
 * the screen bar.
 */
export function PlaceScreen({ place, breadcrumbs, mobileHeader, conversations, section, isPlace = true }: {
  place: Place
  breadcrumbs: Breadcrumb[]
  mobileHeader: ReactNode
  /** What the Conversations section shows: the place's conversations, or one conversation. */
  conversations: ReactNode
  /** The section shown whatever the address says: a conversation's own page is on Conversations. */
  section?: string
  /** False for a screen that is only a list of conversations (Chat): the panel stays the main navigation. */
  isPlace?: boolean
}) {
  const { tool } = usePlaceUrl()
  const current = section ?? chosenSection(place, tool)
  const placeNav = isPlace ? placeNavOf(place, current) : null
  // ‹ on a phone goes to the list the place sits in: the last part of the breadcrumb before the place.
  const backHref = breadcrumbs.slice(0, -1).reverse().find((c) => c.href)?.href ?? '/'

  return (
    <CardPlaceContext.Provider value={cardPlaceOf(place)}>
      <AppShell
        breadcrumbs={placeNav ? drillCrumbs(breadcrumbs, placeNav) : breadcrumbs}
        screenBarRight={<TalkButton place={place} />}
        mobileHeader={placeNav ? <PlaceDrillMobileHeader nav={placeNav} backHref={backHref} /> : mobileHeader}
        placeNav={placeNav}
      >
        <main data-testid="place-canvas" data-section={current} className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <Canvas place={place} section={current} conversations={conversations} />
        </main>
      </AppShell>
    </CardPlaceContext.Provider>
  )
}
