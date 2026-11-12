/**
 * A lead tool's input schema, looked up as a turn looks the tool up (tools/toolAdapter.ts): a conversation's own tool
 * first, then the control plane's tools a turn may call.
 */
import { z } from 'zod'
import { conversationTool } from '../../conversations/work/registry'
import { turnTool } from '../../conversations/tools/turnTools'
import type { LeadToolInput } from './tools'

export const leadToolInput: LeadToolInput = (name) => {
  const own = conversationTool(name)
  if (own) return own.input
  const tool = turnTool(name)
  return tool ? z.object(tool.schema) : null
}
