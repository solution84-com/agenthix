export const HQ_CONNECTION_STATUSES = ['LINKING', 'PENDING', 'ACTIVE', 'DEGRADED', 'VERSION_MISMATCH', 'REVOKED'] as const
export type HqConnectionStatus = typeof HQ_CONNECTION_STATUSES[number]

export function isHqConnectionStatus(value: unknown): value is HqConnectionStatus {
  return typeof value === 'string' && (HQ_CONNECTION_STATUSES as readonly string[]).includes(value)
}
