import { useEffect, useRef, useState } from 'react'
import type { FileBytes, FileFacts, RendererMode, RendererReport } from '@agenthix/core'
import { createFileBytes } from './fileBytes'
import type { Renderer } from './renderer'

interface RendererHostProps {
  renderer: Renderer
  facts: FileFacts
  link: string
  mode: RendererMode
  onReport: (report: RendererReport) => void
  onFact: (text: string) => void
}

/**
 * Mounts one renderer with the file's bytes. Every read it makes is aborted when it unmounts (the file closed or
 * changed), and nothing it reports after that reaches the frame. A new link for the same file (its tickets renewed)
 * keeps the renderer and its bytes: what it has read stays drawn, and later reads use the new ticket.
 */
export function RendererHost({ renderer, facts, link, mode, onReport, onFact }: RendererHostProps) {
  const [bytes, setBytes] = useState<FileBytes | null>(null)
  const handlers = useRef({ onReport, onFact })
  handlers.current = { onReport, onFact }
  const live = useRef(false)
  const currentLink = useRef(link)
  currentLink.current = link
  // Stable for the renderer's whole life, so a renderer may list them as an effect's dependencies.
  const [callbacks] = useState(() => ({
    report: (r: RendererReport) => { if (live.current) handlers.current.onReport(r) },
    fact: (text: string) => { if (live.current) handlers.current.onFact(text) },
  }))

  useEffect(() => {
    const controller = new AbortController()
    live.current = true
    setBytes(createFileBytes(() => currentLink.current, { signal: controller.signal }))
    return () => {
      live.current = false
      controller.abort()
      setBytes(null)
    }
  }, [])

  if (!bytes || !renderer.render) return null
  return <>{renderer.render({ facts, bytes, link, mode, report: callbacks.report, fact: callbacks.fact })}</>
}
