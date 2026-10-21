/** Where a project, a person's own Chat, and what is open in their tools live (every screen reviewed spec §3). */
export interface PlaceRef {
  /** The project's key; null for the person's own Chat. */
  key: string | null
}

export const placePath = (place: PlaceRef): string => (place.key ? `/projects/${place.key}` : '/chat')

/** A board open in the Boards tool of its place. */
export const boardAddress = (place: PlaceRef, boardId: string): string => `${placePath(place)}?tool=boards&board=${boardId}`

/** A workspace open in the Workspaces tool of its place. */
export const workspaceAddress = (place: PlaceRef, workspaceId: string): string => `${placePath(place)}?tool=workspaces&workspace=${workspaceId}`
