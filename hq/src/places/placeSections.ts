import type { Place, PlaceTool } from './placeTypes'

export const OVERVIEW_SECTION = 'overview'
export const CONVERSATIONS_SECTION = 'conversations'
const TOOL_PARAM = 'tool'

export interface PlaceSection {
  id: string
  label: string
  count?: string
  tone?: PlaceTool['tone']
}

/** Every tool the place has, in the order its Overview lists them, the other addresses for a tool included. */
function allTools(place: Place): PlaceTool[] {
  return [...(place.teamRows ?? []), ...place.toolGroups.flatMap((g) => g.tools), ...(place.linkedTools ?? [])]
}

export function findTool(place: Place, id: string | null): PlaceTool | null {
  if (!id) return null
  return allTools(place).find((t) => t.id === id) ?? null
}

/**
 * A place's sections (spec §6, §7): Overview, Conversations, then its tools in the place's order, each with its count
 * and tone. A tool missing from the order follows at the end; another address for a tool has no section of its own.
 */
export function placeSections(place: Place): PlaceSection[] {
  const tools = allTools(place).filter((t) => !t.aliasOf)
  const ordered = [
    ...place.sectionOrder.flatMap((id) => tools.filter((t) => t.id === id)),
    ...tools.filter((t) => !place.sectionOrder.includes(t.id)),
  ]
  return [
    { id: OVERVIEW_SECTION, label: 'Overview' },
    { id: CONVERSATIONS_SECTION, label: 'Conversations' },
    ...ordered.map(({ id, label, count, tone }) => ({ id, label, count, tone })),
  ]
}

/** The section an address's `?tool=` opens: Overview for none, or for a tool the place does not have. */
export function chosenSection(place: Place, tool: string | null): string {
  if (tool === CONVERSATIONS_SECTION) return CONVERSATIONS_SECTION
  const found = findTool(place, tool)
  if (!found) return OVERVIEW_SECTION
  return found.aliasOf ?? found.id
}

/** The tool a section draws; null for Overview and Conversations. */
export function toolOfSection(place: Place, section: string): PlaceTool | null {
  if (section === OVERVIEW_SECTION || section === CONVERSATIONS_SECTION) return null
  return findTool(place, section)
}

export function sectionHref(place: Pick<Place, 'homePath'>, section: string): string {
  return section === OVERVIEW_SECTION ? place.homePath : `${place.homePath}?${TOOL_PARAM}=${encodeURIComponent(section)}`
}

/**
 * A page that shows a place's conversations — the Chat page, a conversation — draws its Conversations section. A
 * tool's address there (`/chat?tool=files`, a link made while the tools sat beside the conversation) goes to the
 * place's own address with the same query, which shows that tool's section.
 */
export function conversationsPageRedirect(search: string, homePath: string): string | null {
  const tool = new URLSearchParams(search).get(TOOL_PARAM)
  if (!tool || tool === CONVERSATIONS_SECTION) return null
  return `${homePath}${search}`
}
