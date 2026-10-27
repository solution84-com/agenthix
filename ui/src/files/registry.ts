import type { FileKind } from '@agenthix/core'
import type { Renderer } from './renderer'
import { markdownRenderer, createMarkdownRenderer, type RenderMarkdown } from './renderers/markdown/markdownRenderer'
import { codeRenderer } from './renderers/code/codeRenderer'
import { jsonRenderer } from './renderers/json/jsonRenderer'
import { tableRenderer } from './renderers/table/tableRenderer'
import { imageRenderer } from './renderers/image/imageRenderer'
import { pdfRenderer } from './renderers/pdf/pdfRenderer'
import { textRenderer } from './renderers/text/textRenderer'

export interface RendererRegistry {
  readonly renderers: readonly Renderer[]
  /** The renderer for a kind: the first entry that names it. `none` never has one. */
  find(kind: FileKind): Renderer | undefined
}

export function createRegistry(renderers: readonly Renderer[]): RendererRegistry {
  return {
    renderers,
    find: kind => (kind === 'none' ? undefined : renderers.find(r => r.kinds.includes(kind) && r.render)),
  }
}

/** Every renderer Agenthix draws with. Adding a format is adding an entry here; the frame does not change. */
export const RENDERERS: readonly Renderer[] = [
  markdownRenderer,
  textRenderer,
  codeRenderer,
  jsonRenderer,
  tableRenderer,
  imageRenderer,
  pdfRenderer,
]

export const defaultRegistry: RendererRegistry = createRegistry(RENDERERS)

/** The default list with Markdown drawn by the caller's own renderer, which is found first. */
export const withMarkdown = (renderMarkdown: RenderMarkdown): RendererRegistry =>
  createRegistry([createMarkdownRenderer(renderMarkdown), ...RENDERERS])
