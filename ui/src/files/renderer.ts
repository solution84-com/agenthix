import type { ReactNode } from 'react'
import type { FileBytes, FileFacts, FileKind, RendererMode, RendererReport, RendererRuns } from '@agenthix/core'

export interface RendererProps {
  facts: FileFacts
  bytes: FileBytes
  /**
   * The preview link as it is now. A renewal of the file's tickets changes it without mounting the renderer afresh:
   * `bytes` reads through the live one, and a framed renderer hands it to its viewer.
   */
  link: string
  mode: RendererMode
  /** One report: ready, partial or failed. The frame turns it into words; a renderer never draws its own error. */
  report: (report: RendererReport) => void
  /** The kind's own fact for the facts line, once known: "14 pages", "1,204 rows", "800 × 600". */
  fact: (text: string) => void
}

/**
 * One entry of the registry (adr-0155): the kinds a renderer draws and where it runs. It is given only the file's
 * facts and a way to read its bytes through the relay, and can do nothing but draw.
 */
export interface Renderer {
  id: string
  kinds: readonly FileKind[]
  /** `page`: drawn by trusted code in hq's page, as text, never as HTML. `frame`: active code, in a sandboxed frame. */
  runs: RendererRuns
  /** The most it reads, in bytes (spec part 6, caps). */
  previewLimit: number
  /** Draws in `embedded` mode too; otherwise the frame draws a card for the file. */
  embeds: boolean
  /** Fills the frame's view and scrolls in one place of its own, so the view does not scroll around it (a table, a PDF). */
  fills?: boolean
  /** A framed renderer's `render` draws its frame on the viewer page and passes its reports on. */
  render?: (props: RendererProps) => ReactNode
  /** A framed renderer's page on the files address. */
  viewer?: string
}
