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
 * The breadcrumb inside a place: the place's parents (*Projects*), the place, then the section shown. The place's name
 * opens Find a project, except an agent's, which is not a project. The screen bar puts *Home* first.
 */
export function drillCrumbs(page: Breadcrumb[], nav: PlaceNav, deeper?: { label: string; sectionHref: string } | null): Breadcrumb[] {
  const parents = page.slice(0, -1)
  const name = page.length ? page[page.length - 1].label : nav.name
  const section = nav.sections.find((s) => s.id === nav.current)
  return [
    ...parents,
    { label: name, href: nav.homePath, ...(nav.kind === 'agent' ? {} : { list: 'projects' as const }) },
    { label: section?.label ?? 'Overview', ...(deeper ? { href: deeper.sectionHref } : {}) },
    ...(deeper ? [{ label: deeper.label }] : []),
  ]
}
