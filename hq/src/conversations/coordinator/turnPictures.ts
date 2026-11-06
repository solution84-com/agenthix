/**
 * The pictures a turn gives its model (conversation's design, *Photos and files*), best effort. The words always name
 * each shared file, so the agent can open it whatever the model sees (`shared/forLead.ts`); the pictures go beside
 * them as image parts when the model may see them:
 *
 * - a model the catalogue says reads text only is given none, and each message this turn answers that carried one is
 *   marked as not seen by it, so the person reads why under their message;
 * - a model that takes images, or one nobody knows, is given the newest pictures, up to `TURN_PICTURES_MAX`, each read
 *   back from the place's shared folder and checked again by its bytes;
 * - when the provider refuses a request that carried pictures before answering anything, the step is sent again
 *   without them (`withdraw`), and the messages are marked the same way.
 */
import { SHARED_IMAGE_MIMES, sniffSharedContent } from '@agenthix/core'
import { ModelCallError, type LeadImage, type LeadMessage } from '../contract'

/** The most pictures one turn gives its model: the newest, this turn's first. */
export const TURN_PICTURES_MAX = 4

export interface PictureSource {
  /** A shared file's bytes from the conversation's own place; throws when it can't be read. */
  read(name: string): Promise<Uint8Array>
  /** The messages whose pictures the model was not given, marked with the model's name. */
  unseen(messageIds: readonly string[], modelLabel: string): Promise<void>
  log?(line: string): void
}

export interface TurnPictures {
  give(messages: LeadMessage[]): Promise<void>
  /** Whether a failed call is a refusal the step may be sent again without its pictures for. */
  refused(err: unknown): boolean
  withdraw(messages: LeadMessage[]): Promise<void>
}

const IMAGE_MIMES: readonly string[] = SHARED_IMAGE_MIMES

type User = Extract<LeadMessage, { role: 'user' }>
const isUser = (m: LeadMessage): m is User => m.role === 'user'

/** The messages this turn answers that carried a picture, among `messages`. */
function answeredWithPictures(messages: readonly LeadMessage[], inputIds: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const m of messages) {
    if (!isUser(m)) continue
    for (const s of m.shared ?? []) if (s.kind === 'image' && inputIds.includes(s.messageId)) ids.add(s.messageId)
  }
  return [...ids]
}

export function turnPictures(opts: {
  /** From the catalogue: true, false (text only), or null when nobody knows. */
  takes: boolean | null
  modelLabel: string
  inputIds: readonly string[]
  source: PictureSource
  max?: number
}): TurnPictures {
  const { takes, modelLabel, inputIds, source } = opts
  const max = opts.max ?? TURN_PICTURES_MAX
  let gave = false

  async function picture(name: string): Promise<LeadImage | null> {
    try {
      const data = await source.read(name)
      const content = sniffSharedContent(data, name)
      return content && IMAGE_MIMES.includes(content.mime) ? { mediaType: content.mime, data } : null
    } catch {
      source.log?.(`A shared picture could not be read for the model; the agent still has its name`)
      return null
    }
  }

  return {
    async give(messages) {
      if (takes === false) {
        const ids = answeredWithPictures(messages, inputIds)
        if (ids.length > 0) await source.unseen(ids, modelLabel)
        return
      }
      let left = max
      for (let i = messages.length - 1; i >= 0 && left > 0; i--) {
        const m = messages[i]
        if (!isUser(m) || !m.shared?.some(s => s.kind === 'image')) continue
        const images: LeadImage[] = []
        for (const s of m.shared) {
          if (s.kind !== 'image' || left === 0) continue
          const got = await picture(s.name)
          if (got) { images.push(got); left-- }
        }
        if (images.length > 0) { messages[i] = { ...m, images }; gave = true }
      }
    },
    refused(err) {
      return gave && err instanceof ModelCallError && (err.kind === 'invalid' || err.kind === 'request')
    },
    async withdraw(messages) {
      gave = false
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i]
        if (isUser(m) && m.images) {
          const rest: User = { ...m }
          delete rest.images
          messages[i] = rest
        }
      }
      const ids = answeredWithPictures(messages, inputIds)
      if (ids.length > 0) await source.unseen(ids, modelLabel)
    },
  }
}
