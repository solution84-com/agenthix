import { SITE_PROTOCOL_VERSION, type HQConnectionMessage } from '@agenthix/core'
import { channelMethods, type ChannelMethod } from './channelMethods'

/** A request as it arrives: its method is looked up here, its params read by the handler. */
export type ReceivedRequest = HQConnectionMessage<{ method?: string; params?: unknown } | undefined>

/**
 * hq asks, this site answers on the same socket. Every path here ends in a reply — an unknown method and a thrown
 * handler both answer explicitly, because the only other outcome is hq waiting out its timeout for nothing.
 */
export async function answerChannelRequest(
  msg: ReceivedRequest,
  siteId: string,
  send: (reply: HQConnectionMessage) => void,
  methods: Readonly<Record<string, ChannelMethod>> = channelMethods,
): Promise<void> {
  const requestId = msg.requestId
  if (!requestId) return
  const reply = (type: 'channel.response' | 'channel.error', payload: unknown) =>
    send({ version: SITE_PROTOCOL_VERSION, type, siteId, replyTo: requestId, payload })

  const method = msg.payload?.method ?? ''
  // Only a method the map itself has: a name like `toString` or `__proto__` is not one.
  const handler = Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : undefined
  if (!handler) {
    reply('channel.error', { message: `Unknown method: ${method}`, code: 'unknown_method' })
    return
  }
  try {
    reply('channel.response', await handler(msg.payload?.params))
  } catch (err) {
    // The message, not the stack: hq logs this and an operator reads it there.
    reply('channel.error', { message: err instanceof Error ? err.message : 'Handler failed', code: 'handler_failed' })
  }
}
