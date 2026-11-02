/**
 * What the live preview's own code needs of its services and its install rule, set when the site starts
 * (`livePreviewService.ts`), so the store, the apps and the guard reach Docker's service code only through these.
 */
import type { AppSpec, LivePreviewAppRefused, ServiceProblem, ServiceStatus } from '@agenthix/core'
import type { InspectedContainer } from './guard/guardDocker'
import type { PreviewOf } from './apps/appTable'

export type PreviewServices = {
  /** Started, and waited for, before an app; a refusal when the services file is refused. */
  beforeStart(lp: PreviewOf, spec: AppSpec): Promise<LivePreviewAppRefused | null>
  ports(id: string): ReadonlySet<number>
  statuses(id: string): ServiceStatus[]
  problems(id: string): ServiceProblem[]
  /** A person's yes to a declaration, by its hash; false when the file no longer holds it. */
  approve(id: string, service: string, declaration: string): Promise<boolean>
  stopAll(id: string): Promise<void>
  differences(id: string, c: InspectedContainer): string[] | null
  healthCheck(id: string, containerName: string, command: string): boolean
}

export type PreviewInstalls = {
  /**
   * A person's yes to one blocked package, named exactly; false when nothing blocked it in this live preview. The yes
   * is kept for the live preview's branch too (`branchKey`), so it counts in every copy of the branch.
   */
  allow(id: string, pkg: { ecosystem: string; name: string; version: string }, branch: { workspaceId: string; branch: string }): boolean
  forget(id: string): void
}

export const seams: { services: PreviewServices; installs: PreviewInstalls } = {
  services: {
    beforeStart: async () => null,
    ports: () => new Set(),
    statuses: () => [],
    problems: () => [],
    approve: async () => false,
    stopAll: async () => {},
    differences: () => null,
    healthCheck: () => false,
  },
  installs: { allow: () => false, forget: () => {} },
}
