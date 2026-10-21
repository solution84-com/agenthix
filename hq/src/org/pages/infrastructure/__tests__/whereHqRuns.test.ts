import { describe, expect, it } from 'vitest'
import { whereHqRunsLine } from '../whereHqRuns'

describe('where HQ runs @SC-1120', () => {
  it('self-hosted and not connected names the Fleet Console\'s HQ page in words', () => {
    expect(whereHqRunsLine({ hosting: 'self', connectedAs: null })).toContain("fleet admins see how on HQ's page in the Fleet Console")
  })
  it('self-hosted and connected says as whom', () => {
    expect(whereHqRunsLine({ hosting: 'self', connectedAs: 'Acme Robotics' })).toBe('Self-hosted · connected to Agenthix Cloud as Acme Robotics')
  })
  it('on Agenthix Cloud says Cloud keeps it up to date and backed up', () => {
    expect(whereHqRunsLine({ hosting: 'cloud', connectedAs: 'Acme Robotics' })).toBe('On Agenthix Cloud · Cloud keeps HQ up to date and backed up')
  })
})
