import { useEffect } from 'react'

const MENTION_EVENT = 'agenthix:mention'

/**
 * Puts a reference into the message box of the conversation open beside the caller (spec §3, *The Files tools*).
 * A message box that takes it calls `preventDefault`; the result says whether one did.
 */
export function mentionInMessage(text: string): boolean {
  const event = new CustomEvent<string>(MENTION_EVENT, { detail: text, cancelable: true })
  return !window.dispatchEvent(event)
}

/** A message box listens for mentions while it is drawn; `insert` adds the text to what is being written. */
export function useMentionTarget(insert: (text: string) => void): void {
  useEffect(() => {
    const onMention = (e: Event) => {
      e.preventDefault()
      insert((e as CustomEvent<string>).detail)
    }
    window.addEventListener(MENTION_EVENT, onMention)
    return () => window.removeEventListener(MENTION_EVENT, onMention)
  }, [insert])
}
