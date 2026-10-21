import { CONNECTION_GROUPS } from '../connections'
import type { CallerContext, ConnectionGrant } from '../../server/controlplane/types'

/** A person's connection as the control plane sees it — every group on and no project list, unless overridden. */
export function connectionCaller(overrides: Partial<ConnectionGrant> = {}): CallerContext {
  return {
    kind: 'connection',
    connection: {
      connectionId: 'conn-1',
      userId: 'user-conn',
      role: 'ADMIN',
      groups: new Set(CONNECTION_GROUPS),
      projectIds: null,
      ...overrides,
    },
  }
}
