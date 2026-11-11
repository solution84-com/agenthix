/**
 * What an embed draws in Markdown (spec part 2, *Embedded files*; board T3): an image of the place inline, through
 * the relay, up to 480 px tall; a broken image with its name when it can't be; another website's image only after
 * Load; a card for any other file, drawn by ui's frame; a chip for a file named inside a sentence.
 *
 * Images and chips sit inside a paragraph, so they are inline elements. Every image is fetched with no referrer.
 */
import { useState, type ReactNode } from 'react'
import { ImageOff } from 'lucide-react'
import { FILE_KINDS, type FileKind, type FileOpenAnswer, type SiteFileRef } from '@agenthix/core'
import { FileFrame, createRegistry } from '@agenthix/ui/files'
import { BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'
import type { MarkdownEmbedContext } from './embedTarget'
import { useEmbedAnswer } from './useEmbedAnswer'
import { ChangedSince, changedSince, FileChip } from './FileChip'

export { FileChip } from './FileChip'

export type Size = { width?: string | number; height?: string | number }

const IMAGE_CLASS = 'inline-block max-w-full h-auto max-h-[480px] object-contain rounded-lg align-middle'
const QUIET_BUTTON = `inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-small ${BUTTON_SECONDARY}`

/** Why an image isn't drawn, said under its name with the path it looked for (S18). */
export const IMAGE_WHY = {
  missing: "isn't there",
  undrawable: "can't be drawn",
  outside: "is outside this place, so it isn't shown",
  unavailable: "can't be shown right now",
} as const

export function BrokenImage({ name, path, why, children }: {
  name: string
  /** The path it looked for, as written. */
  path?: string
  why?: string
  children?: ReactNode
}) {
  const said = path && path !== name ? path : null
  return (
    <span role="img" aria-label={`${name} can't be shown${why ? `: ${said ?? name} ${why}` : ''}`} className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-border-subtle bg-surface-2 px-2 py-1 align-middle text-small text-text-muted">
      <ImageOff size={14} aria-hidden className="shrink-0" />
      <span className="text-text-secondary">{name}</span>
      {(said || why) && (
        <span className="min-w-0 break-all">
          {said && <span className="font-mono">{said}</span>}{said && why ? ' ' : ''}{why}
        </span>
      )}
      {children}
    </span>
  )
}

/** Another website's image waits for a click, so opening a page never tells that website who's reading (T13). */
export function WebImage({ url, host, alt, ...size }: { url: string; host: string; alt?: string } & Size) {
  const [load, setLoad] = useState(false)
  if (!load) {
    return (
      <button type="button" className={QUIET_BUTTON} onClick={() => setLoad(true)}>
        <ImageOff size={14} aria-hidden className="shrink-0" />
        <span>Image from {host} · Load</span>
      </button>
    )
  }
  return <img src={url} alt={alt ?? ''} {...size} referrerPolicy="no-referrer" className={IMAGE_CLASS} />
}

type Opened = { answer?: FileOpenAnswer; observe: (el: Element | null) => void; retry: () => void }
type Usable = Extract<FileOpenAnswer, { state: 'ready' | 'no-files-address' }>

/**
 * An embedded image from its open answer: its name while it is asked for, broken when it can't be, the image through
 * its preview ticket, and `notImage` for a file that turns out not to be an image.
 */
export function ImageEmbed({ opened, name, path, alt, size, onOpen, writtenAt, notImage }: {
  opened: Opened; name: string; path?: string; alt?: string; size: Size; onOpen?: () => void; writtenAt?: string
  notImage: (answer: Usable, label: string) => ReactNode
}) {
  const { answer, observe, retry } = opened
  const [failed, setFailed] = useState(false)
  const label = alt || name

  let body: ReactNode
  if (!answer) body = <span className="text-small text-text-muted">{label}</span>
  else if (answer.state === 'not-found') body = <BrokenImage name={label} path={path ?? name} why={IMAGE_WHY.missing} />
  else if (failed) body = <BrokenImage name={label} path={path ?? name} why={IMAGE_WHY.undrawable} />
  else if (answer.state !== 'ready' && answer.state !== 'no-files-address') {
    body = (
      <BrokenImage name={label} path={path ?? name} why={`${IMAGE_WHY.unavailable}.`}>
        <button type="button" className={`rounded text-link underline underline-offset-2 ${FOCUS_RING}`} onClick={retry}>Try again</button>
      </BrokenImage>
    )
  } else if (answer.state !== 'ready' || answer.facts.kind !== 'image') {
    body = notImage(answer, label)
  } else {
    const img = (
      <img
        src={answer.previewLink} alt={alt ?? ''} {...size} referrerPolicy="no-referrer" loading="lazy" decoding="async"
        className={IMAGE_CLASS} onError={() => setFailed(true)}
      />
    )
    body = onOpen
      ? <button type="button" aria-label={`Open ${name}`} className="inline-block max-w-full" onClick={onOpen}>{img}</button>
      : img
  }
  const changed = answer?.state === 'ready' && answer.facts.kind === 'image' && !failed && changedSince(answer.facts, writtenAt)
  return (
    <span ref={observe} data-embed="image" className="inline-block max-w-full">
      {body}
      {changed && <span className="block"><ChangedSince /></span>}
    </span>
  )
}

export function EmbeddedImage({ fileRef, name, alt, context, ...size }: {
  fileRef: SiteFileRef; name: string; alt?: string; context: MarkdownEmbedContext
} & Size) {
  const opened = useEmbedAnswer(fileRef)
  const open = context.onOpen
  return (
    <ImageEmbed
      opened={opened} name={name} path={fileRef.space === 'artefact' ? fileRef.name : fileRef.path} alt={alt} size={size} writtenAt={context.writtenAt}
      onOpen={open ? () => open(fileRef) : undefined}
      notImage={(answer, label) => (
        <FileChip fileRef={fileRef} context={context} known={{ state: 'ready', facts: answer.facts }}>{label}</FileChip>
      )}
    />
  )
}

/** Every kind but `none` drawn as a card, never inline: the frame's embedded card, with its facts and its states. */
const CARD_KINDS = FILE_KINDS.filter((k): k is Exclude<FileKind, 'none'> => k !== 'none')
export const CARDS_ONLY = createRegistry([
  { id: 'card', kinds: CARD_KINDS, runs: 'page', previewLimit: 0, embeds: false, render: () => null },
])

export function FileCard({ fileRef, name, context }: { fileRef: SiteFileRef; name: string; context: MarkdownEmbedContext }) {
  const { answer, observe, retry } = useEmbedAnswer(fileRef, true)
  const open = context.onOpen
  // A conversation's reference that opens no file may be a folder, or gone: the chip asks which and says so.
  if (answer?.state === 'not-found' && fileRef.space === 'place' && context.place.space === 'owner') {
    return <p ref={observe}><FileChip fileRef={fileRef} context={context}>{name}</FileChip></p>
  }
  return (
    <div ref={observe} data-embed="card" className="my-2">
      <FileFrame
        answer={answer} name={name} mode="embedded" registry={CARDS_ONLY} onReopen={retry}
        onOpen={open ? () => open(fileRef) : undefined}
      />
    </div>
  )
}
