import type { ReactNode } from 'react'
import { formatTime } from '@agenthix/ui/sessions'

/**
 * The person's words in their bubble: one look for a message sent and for words still being said, in a call and in the
 * voice playground, so words being said become the sent message in place.
 */
export function PersonWords({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2.5">
      <p className="whitespace-pre-wrap break-words text-reading text-text-primary">{children}</p>
    </div>
  )
}

/** The name and time over the person's bubble. */
export function PersonByline({ author, at }: { author?: string | null; at: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-micro text-text-muted">
      <span className="font-medium">{author ?? 'You'}</span>
      <span aria-hidden>·</span>
      <span>{formatTime(at)}</span>
    </div>
  )
}

/**
 * What the person is saying in a call, before it is sent, drawn as their message will be once it is. `data-person-words`
 * tells the thread's follow that the person's words are below the reply, so it follows them.
 */
export function LivePersonBubble({ text, since }: { text: string; since: string }) {
  return (
    <div className="flex justify-end" data-testid="listening-bubble" data-person-words>
      <div className="flex max-w-[72%] flex-col items-end">
        <PersonByline at={since} />
        <PersonWords>{text}</PersonWords>
      </div>
    </div>
  )
}
