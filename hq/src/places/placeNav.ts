import type { Breadcrumb } from '../shared/layouts/ScreenBar'
import type { PlaceNav, PlaceNavKind, PlaceNavSection } from '../shared/layouts/placeNavTypes'
import type { Place } from './placeTypes'
import { CONVERSATIONS_SECTION, OVERVIEW_SECTION, placeSections, sectionHref } from './placeSections'

export function placeKind(place: Pick<Place, 'homePath'>): PlaceNavKind {
  if (place.homePath.startsWith('/projects/')) return 'project'
  if (place.homePath.startsWith('/agents/')) return 'agent'
  return 'space'
}

// Sections that belong to no labelled group of the place (Members, a project's Settings) sit under this one.
const TRAILING_GROUP: Record<PlaceNavKind, string | null> = { project: 'Project', space: null, agent: null }

/**
 * A place's sections as the drilled-in panel lists them: the place's order,
 * each under its group's small label. A label is never repeated: a section whose group already came earlier (a
 * project's Memory, after Settings) stays under the label before it.
 */
export function navSections(place: Place): PlaceNavSection[] {
  const groupOf = new Map<string, string | null>()
  for (const g of place.toolGroups) for (const t of g.tools) groupOf.set(t.id, g.label)
  const trailing = TRAILING_GROUP[placeKind(place)]
  const used = new Set<string>()
  let group: string | null = null
  return placeSections(place).map((section) => {
    if (section.id === OVERVIEW_SECTION || section.id === CONVERSATIONS_SECTION) {
      return { ...section, href: sectionHref(place, section.id), group: null }
    }
    const own = groupOf.get(section.id) ?? null
    if (own === null) group = trailing
    else if (!used.has(own)) group = own
    if (group) used.add(group)
    return { ...section, href: sectionHref(place, section.id), group }
  })
}

export function placeNavOf(place: Place, current: string): PlaceNav {
  const kind = placeKind(place)
  const agent = kind === 'agent' ? place.agents[0] : undefined
  return {
    kind,
    id: kind === 'project' ? place.projectId : agent?.id ?? null,
    name: place.name,
    homePath: place.homePath,
    avatarUrl: agent?.avatarUrl ?? null,
    sections: navSections(place),
    current,
  }
}

/**
 * The breadcrumb when drilled in: *Home ▾*, the place's parents (*Projects ▾*), the place (your projects, for a
 * project or your space), then the section shown. Each part opens its list.
 */
export function drillCrumbs(page: Breadcrumb[], nav: PlaceNav): Breadcrumb[] {
  const parents = page.slice(0, -1).map((c): Breadcrumb => ({ ...c, list: 'places' }))
  const name = page.length ? page[page.length - 1].label : nav.name
  const section = nav.sections.find((s) => s.id === nav.current)
  return [
    { label: 'Home', href: '/', list: 'main' },
    ...parents,
    { label: name, href: nav.homePath, list: nav.kind === 'agent' ? undefined : 'projects' },
    { label: section?.label ?? 'Overview', list: 'sections' },
  ]
}
