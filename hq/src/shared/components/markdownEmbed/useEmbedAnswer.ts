import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { createEmbedBatch, type EmbedBatch } from './embedBatch'
import { embedKey } from './embedTarget'

let live: EmbedBatch | null = null
function liveBatch(): EmbedBatch {
  // Loaded when the first embed is opened, so drawing Markdown with no embeds never loads the operations client.
  live ??= createEmbedBatch(async files => {
    const { openFiles } = await import('wasp/client/operations')
    return (await openFiles({ files })).answers as FileOpenAnswer[]
  })
  return live
}

/** The batch embeds are opened through; tests give their own. */
export const EmbedBatchContext = createContext<EmbedBatch | null>(null)

/** Whether the element has come into view; without an observer (a test, an old browser) it counts as in view. */
export function useSeen(): [boolean, (el: Element | null) => void] {
  const [el, setEl] = useState<Element | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setSeen(true)
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, seen])
  return [seen, setEl]
}

/**
 * An open answer, asked for with `open` once the embed comes into view; `key` names what is opened, so a new `open`
 * for the same thing asks nothing new. With `renew`, it is asked for again when its tickets end, so a card's Download
 * keeps working; an image already drawn needs no new ticket.
 */
export function useOpenAnswer(key: string, open: () => Promise<FileOpenAnswer>, renew = false) {
  const [seen, observe] = useSeen()
  const [answer, setAnswer] = useState<FileOpenAnswer>()
  const [round, setRound] = useState(0)
  const opener = useRef(open)
  opener.current = open

  useEffect(() => {
    if (!seen) return
    let current = true
    setAnswer(undefined)
    void opener.current().then(a => { if (current) setAnswer(a) })
    return () => { current = false }
  }, [key, seen, round])

  const expiresAt = answer && 'expiresAt' in answer ? answer.expiresAt : undefined
  useEffect(() => {
    if (!renew || expiresAt === undefined) return
    const t = setTimeout(() => setRound(r => r + 1), Math.max(0, expiresAt - Date.now()))
    return () => clearTimeout(t)
  }, [renew, expiresAt])

  const retry = useCallback(() => setRound(r => r + 1), [])
  return { answer, observe, retry }
}

/** The open answer for one embedded file of a place, through the batch every embed on screen shares. */
export function useEmbedAnswer(ref: SiteFileRef, renew = false) {
  const batch = useContext(EmbedBatchContext) ?? liveBatch()
  return useOpenAnswer(embedKey(ref), () => batch.open(ref), renew)
}
