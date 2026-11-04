import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CONTROL_PLANE_TOOLS } from '../toolSchemas'

const toolSchema = (name: string) => z.object(CONTROL_PLANE_TOOLS.find(t => t.name === name)!.schema)

describe('create_task @SC-111', () => {
  it('needs a title and a project, and not an organisation id that nothing reads', () => {
    const schema = toolSchema('create_task')
    expect(schema.safeParse({ title: 'T', projectId: 'WAL' }).success).toBe(true)
    expect(schema.safeParse({ title: 'T', projectId: 'WAL', orgId: 'o' }).success).toBe(true)
    expect(schema.safeParse({ title: 'T' }).success).toBe(false)
  })
})
