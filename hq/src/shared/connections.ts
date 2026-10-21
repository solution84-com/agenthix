/**
 * A connection's permission groups (adr-0090, agents own schedule spec §10).
 * Each is on or off, and each only narrows what the connection's person may do.
 * Client-safe: the connections page lists them, and the control plane places
 * every tool in one of them (`server/controlplane/connectionGroups.ts`).
 */
export const CONNECTION_GROUPS = ['read', 'change_tasks', 'start_work', 'manage'] as const
export type ConnectionGroup = (typeof CONNECTION_GROUPS)[number]

export const CONNECTION_GROUP_INFO: Record<ConnectionGroup, { label: string; covers: string; defaultOn: boolean }> = {
  read: { label: 'Read', covers: 'Projects, boards, tasks, comments', defaultOn: true },
  change_tasks: { label: 'Change tasks', covers: 'Create, edit, move and comment on tasks', defaultOn: false },
  start_work: { label: 'Start work', covers: 'Run a task, set a schedule', defaultOn: false },
  manage: {
    label: 'Manage',
    covers: "Boards, workforce templates, project settings — only where your role already allows it",
    defaultOn: false,
  },
}

export function isConnectionGroup(value: unknown): value is ConnectionGroup {
  return typeof value === 'string' && (CONNECTION_GROUPS as readonly string[]).includes(value)
}

/** How long a connection lasts from creation or renewal, in days. */
export const CONNECTION_EXPIRY_DAYS = [7, 30, 90, 180, 365] as const
export const DEFAULT_CONNECTION_EXPIRY_DAYS = 90

/** A connection as its person sees it in their settings — never its token or hash. */
export type ConnectionView = {
  id: string
  name: string
  tokenPrefix: string
  groups: ConnectionGroup[]
  /** null: every project its person can reach. */
  projects: { id: string; name: string }[] | null
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type ConnectionsOverview = {
  connections: ConnectionView[]
  /** The address a tool connects to, ending in /mcp. */
  mcpUrl: string
}
