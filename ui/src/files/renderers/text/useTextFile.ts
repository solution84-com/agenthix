import { useEffect, useState } from 'react'
import type { RendererProps } from '../../renderer'
import { failureOf } from '../../readFailure'

/** Text and Markdown read the same: at most 1 MB (spec part 6). */
export const TEXT_LIMIT = 1024 * 1024

export function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/**
 * Reads the file's first 1 MB and decodes it as UTF-8. Reports ready, partial (past the cap) or failed, and gives the
 * line count as the kind's own fact when the whole file was read. Returns null until the text is there.
 */
export function useTextFile({ bytes, report, fact }: Pick<RendererProps, 'bytes' | 'report' | 'fact'>): string | null {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    bytes.read(TEXT_LIMIT).then(({ bytes: read, whole }) => {
      if (!live) return
      let decoded: string
      try {
        // Streaming keeps a character cut at the end of a partial read from counting as bytes that aren't text.
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(read, { stream: !whole })
      } catch {
        report({ state: 'failed', reason: 'unreadable' })
        return
      }
      setText(decoded)
      if (whole) {
        const lines = lineCount(decoded)
        fact(`${lines.toLocaleString('en-GB')} ${lines === 1 ? 'line' : 'lines'}`)
        report({ state: 'ready' })
      } else {
        report({ state: 'partial', shown: read.length })
      }
    }, error => {
      const reason = failureOf(error)
      if (live && reason) report({ state: 'failed', reason })
    })
    return () => { live = false }
  }, [bytes, report, fact])
  return text
}
