/** What kind of place the left panel is drilled into. */
export type PlaceNavKind = 'project' | 'space' | 'agent'

/** One section of a place, as its menu, the breadcrumb and the phone's project drawer list it. */
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
 * A place as the shell draws it: plain data, published by the place's screen and drawn by its menu beside the rail,
 * the breadcrumb and the phone's top bar and project drawer.
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

/** What a breadcrumb's part opens instead of being a link: the project's name opens Find a project. */
export type CrumbList = 'projects'
