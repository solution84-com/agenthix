import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'

describe('the create_task arguments an agent is shown', () => {
  it('do not require an organisation, as hq does not', () => {
    const tool = FORWARDED_TOOLS.find(t => t.name === 'create_task')!
    expect(z.object(tool.schema).safeParse({ title: 'T', projectId: 'p1' }).success).toBe(true)
  })
})
