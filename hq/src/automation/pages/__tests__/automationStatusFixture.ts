import type { AutomationStatusView } from '@agenthix/ui/projects'

export const status = (enabled: boolean): AutomationStatusView => ({
  org: { allowed: true, intervalMinutes: 30, batchSize: 3, queueLimit: 20, agentSchedules: true, throttle: false, maxDepth: 5 },
  choice: { enabled, intervalMinutes: null, batchSize: null, queueLimit: 10, agentSchedules: false, throttle: false, maxDepth: 3 },
  effective: {
    enabled, intervalMinutes: 30, batchSize: 3, queueLimit: 10, agentSchedules: false, throttle: false, maxDepth: 3,
    limitedByOrg: {
      enabled: false, intervalMinutes: false, batchSize: false, queueLimit: false, agentSchedules: false, throttle: false, maxDepth: false,
    },
  },
  roundOpen: false, lastRoundFinishedAt: null, nextPulseAt: null, queued: 0, throttled: 0, agentHeld: 0,
})
