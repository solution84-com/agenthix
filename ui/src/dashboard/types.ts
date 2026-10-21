export type {
  DashboardSnapshot,
  DashboardSnapshotProject,
  DashboardSnapshotAgent,
  DashboardSnapshotActivity,
  DashboardSnapshotActivityType,
} from '@agenthix/core'

import type {
  DashboardSnapshot,
  DashboardSnapshotProject,
  DashboardSnapshotAgent,
  DashboardSnapshotActivity,
} from '@agenthix/core'

/** Project row carrying the source site so HQ aggregations can label rows. */
export interface DashboardProjectRow extends DashboardSnapshotProject {
  siteSlug: string | null
  siteName: string
}

export interface DashboardAgentRow extends DashboardSnapshotAgent {
  siteSlug: string | null
  siteName: string
}

export interface DashboardActivityRow extends DashboardSnapshotActivity {
  siteSlug: string | null
  siteName: string
}

/** Aggregated snapshot used by the All-sites view. Site rows merged + sorted; sums in totals. */
export interface AggregatedSnapshot {
  capturedAt: string
  totals: DashboardSnapshot['totals']
  taskCounts: DashboardSnapshot['taskCounts']
  runs: DashboardSnapshot['runs']
  financial: DashboardSnapshot['financial']
  recentProjects: DashboardProjectRow[]
  topAgents: DashboardAgentRow[]
  recentActivity: DashboardActivityRow[]
  /** Sites currently online (have sent a recent snapshot). */
  onlineSiteCount: number
  /** Sites the user is a member of. */
  totalSiteCount: number
}

/** Snapshot pre-paired with the HQ-side site context (slug + display name) for aggregation. */
export interface SnapshotWithContext {
  snapshot: DashboardSnapshot
  siteSlug: string
  siteName: string
}
