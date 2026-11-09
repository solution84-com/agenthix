/**
 * One call as it was handed to hq's model adapter, for "Show exactly what was sent": read from the request itself,
 * never rebuilt. The access's key never leaves; a picture is named by its type and size, not sent to the page.
 */
import { z } from 'zod'
import type { SentRequest } from '../../../../shared/voicePlayground'
import type { LeadMessage, LeadRequest } from '../../../contract'

function plainMessage(m: LeadMessage): unknown {
  if (m.role !== 'user' || !m.images?.length) return m
  return { ...m, images: m.images.map(i => ({ mediaType: i.mediaType, bytes: i.data.byteLength })) }
}

function schemaOf(input: z.ZodType): unknown {
  try { return z.toJSONSchema(input) } catch { return '(this tool\'s input cannot be shown as JSON Schema)' }
}

export function sentOf(request: LeadRequest): SentRequest {
  const { access } = request
  return {
    instructions: request.system.map(p => p.text),
    messages: request.messages.map(plainMessage),
    tools: request.tools.map(t => ({ name: t.name, description: t.description, input: schemaOf(t.input) })),
    settings: {
      model: access.model,
      provider: access.providerName,
      ...(request.toolChoice !== undefined && { toolChoice: request.toolChoice }),
      ...(request.maxOutputTokens !== undefined && { maxOutputTokens: request.maxOutputTokens }),
      ...(request.spoken && { spoken: true }),
      ...(request.firstSpokenStep && { firstSpokenStep: true }),
      ...(request.cacheAfterMessage !== undefined && { cacheAfterMessage: request.cacheAfterMessage }),
    },
  }
}
