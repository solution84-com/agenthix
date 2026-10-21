/** What kind of place the left panel is drilled into. */
export type PlaceNavKind = 'project' | 'space' | 'agent'

/** One section of a place, as the drilled-in panel, the breadcrumb and the small screen's header list it. */
export interface PlaceNavSection {
  id: string
  label: string
  count?: string
  tone?: 'needs' | 'live'
  href: string
  /** The small label the section sits under in the panel; null for the unlabelled sections (Overview, Conversations). */
  group: string | null
}

/**
 * A place as the shell draws it when the panel is drilled into it: plain data, published by the place's screen
 * and drawn by the navigation, the breadcrumb and the small screen's header.
 */
export interface PlaceNav {
  kind: PlaceNavKind
  /** The project's or the agent's id: its avatar's colour and its pin. Null for your space. */
  id: string | null
  name: string
  /** The place's own address, its Overview. */
  homePath: string
  avatarUrl: string | null
  sections: PlaceNavSection[]
  /** The section shown. */
  current: string
}

/** The list a breadcrumb's part opens when the panel is drilled into a place. */
export type CrumbList = 'main' | 'places' | 'projects' | 'sections'
