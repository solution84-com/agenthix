import { createContext, useContext, useEffect, useState } from 'react'
import type { SiteFileRef } from '@agenthix/core'
import type { FileFactsAnswer } from '../../../files/fileFactsAnswer'
import { createEmbedBatch, type EmbedBatch } from './embedBatch'
import { embedKey } from './embedTarget'
import { useSeen } from './useEmbedAnswer'

let live: EmbedBatch<FileFactsAnswer> | null = null
function liveBatch(): EmbedBatch<FileFactsAnswer> {
  live ??= createEmbedBatch<FileFactsAnswer>(async files => {
    const { getFileFacts } = await import('wasp/client/operations')
    return (await getFileFacts({ files })).answers as FileFactsAnswer[]
  })
  return live
}

/** The batch chips ask after their files through; tests give their own. */
export const ChipFactsContext = createContext<EmbedBatch<FileFactsAnswer> | null>(null)

/**
 * What a chip shows of its file, asked for once it comes into view: its facts, or that it is gone. Unlike an embed,
 * a chip opens nothing, so no ticket is signed for it and nothing is recorded. With `known`, the caller already has
 * the facts and nothing is asked.
 */
export function useChipFacts(ref: SiteFileRef, known?: FileFactsAnswer) {
  const batch = useContext(ChipFactsContext) ?? liveBatch()
  const [seen, observe] = useSeen()
  const [asked, setAsked] = useState<FileFactsAnswer>()
  const key = embedKey(ref)
  const ask = seen && !known

  useEffect(() => {
    if (!ask) return
    let current = true
    setAsked(undefined)
    void batch.open(ref).then(a => { if (current) setAsked(a) })
    return () => { current = false }
    // `ref` is named by `key`: a new object for the same file asks nothing new.
  }, [batch, key, ask])

  return { answer: known ?? asked, observe }
}
