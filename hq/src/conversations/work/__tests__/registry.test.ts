/** Every tool a conversation offers names the area of the work it belongs to (lean agent context spec, §3). */
import { describe, expect, it } from 'vitest'
import { conversationTools } from '../registry'
import { LEAN_TOOLS } from '../../tools/leanTaskTools'

describe("the conversation's own tools", () => {
  it('each declare an area', () => {
    for (const tool of [...conversationTools(), ...LEAN_TOOLS]) expect(tool.area, tool.name).toBeTruthy()
  })
})
