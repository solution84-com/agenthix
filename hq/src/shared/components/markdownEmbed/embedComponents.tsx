/**
 * The Markdown components that embed files, given the place the text belongs to: images (a Markdown image or a sized
 * image tag, D23) resolved in that place or held behind Load, a link to a file standing on its own line as a card,
 * and one inside a sentence as a chip. Any other link is drawn as `link` draws it.
 */
import type { ReactNode } from 'react'
import type { Components } from 'react-markdown'
import { resolveEmbedTarget, type MarkdownEmbedContext } from './embedTarget'
import { BrokenImage, EmbeddedImage, FileCard, WebImage } from './EmbedParts'
import { FileChip, LinkChip } from './FileChip'
import { TaskChip } from './TaskChip'
import { AttachmentCard, AttachmentImage } from './attachmentEmbed'
import { readStableLink, refOfReference } from '../../../storage/pages/fileReferences'
import { taskReferenceOf } from '../../taskReferences'

type HastChild = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown> }
type HastParagraph = { children?: HastChild[] }

/** The href of the one link a paragraph holds and nothing else, besides spaces. */
function soleLinkHref(node: HastParagraph | undefined): string | null {
  const kids = (node?.children ?? []).filter(c => !(c.type === 'text' && !(c.value ?? '').trim()))
  if (kids.length !== 1 || kids[0].type !== 'element' || kids[0].tagName !== 'a') return null
  const href = kids[0].properties?.href
  return typeof href === 'string' ? href : null
}

/**
 * A stable link pasted into the text, as the same chip a reference makes: one into the text's own place opens beside
 * it, one into another place goes there.
 */
function stableLinkChip(href: string | undefined, context: MarkdownEmbedContext): ReactNode {
  if (!href || typeof window === 'undefined') return null
  const link = readStableLink(href, window.location.origin)
  if (!link) return null
  const parts = link.reference.split('/')
  // A task's link is the same chip in any conversation: a task is found across the organisation.
  const task = taskReferenceOf(parts)
  if (task) return context.place.space === 'owner' ? <TaskChip taskRef={task} reference={link.reference} context={context} /> : null
  const ref = context.place.space === 'owner' && link.placePath === context.placePath
    ? refOfReference(context.place.owner, parts) : null
  if (ref) return <FileChip fileRef={ref} context={context}>{parts[parts.length - 1]}</FileChip>
  return <LinkChip href={href} reference={link.reference} />
}

/** A click on a task's own embedded attachment opens it beside the task, where the screen can. */
function openAttachment(context: MarkdownEmbedContext, target: { taskId: string; taskKey: string }) {
  const open = context.onOpenTaskFile
  return open ? (id: string) => open({ taskId: target.taskId, taskKey: target.taskKey, loc: null, file: { kind: 'attachment', id } }) : undefined
}

export function embedComponents(
  context: MarkdownEmbedContext,
  link: (href: string | undefined, children: ReactNode) => ReactNode,
  paragraph: (children: ReactNode) => ReactNode,
): Partial<Components> {
  return {
    img: ({ src, alt, width, height }) => {
      const target = resolveEmbedTarget(typeof src === 'string' ? src : '', context)
      const size = { width, height }
      switch (target.kind) {
        case 'file':
          return <EmbeddedImage fileRef={target.ref} name={target.name} alt={alt} context={context} {...size} />
        case 'folder':
          return <FileChip fileRef={target.ref} context={context} folder>{alt || target.name}</FileChip>
        case 'task':
          return <TaskChip taskRef={target.ref} reference={target.reference} context={context} />
        case 'attachment':
          return <AttachmentImage taskId={target.taskId} fileName={target.name} alt={alt} onOpen={openAttachment(context, target)} {...size} />
        case 'web':
          return <WebImage url={target.url} host={target.host} alt={alt} {...size} />
        case 'outside':
          return <BrokenImage name={alt || target.name} />
        case 'none':
          return <BrokenImage name={alt || 'Image'} />
      }
    },
    a: ({ href, children }) => {
      const pasted = stableLinkChip(href, context)
      if (pasted) return pasted
      const target = resolveEmbedTarget(href, context)
      if (target.kind === 'file') return <FileChip fileRef={target.ref} context={context}>{children}</FileChip>
      if (target.kind === 'folder') return <FileChip fileRef={target.ref} context={context} folder>{children}</FileChip>
      if (target.kind === 'task' || target.kind === 'attachment') return <TaskChip taskRef={target.ref} reference={target.reference} context={context} />
      return link(href, children)
    },
    p: ({ node, children }) => {
      const href = soleLinkHref(node as HastParagraph | undefined)
      const target = href === null ? null : resolveEmbedTarget(href, context)
      if (target?.kind === 'file') return <FileCard fileRef={target.ref} name={target.name} context={context} />
      if (target?.kind === 'attachment') return <AttachmentCard taskId={target.taskId} fileName={target.name} onOpen={openAttachment(context, target)} />
      return paragraph(children)
    },
  }
}
