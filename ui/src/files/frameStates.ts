/**
 * What the frame shows (spec part 2, *The frame's states*), worked out from the open answer and the renderer's report.
 * Every word the frame says about a file it cannot draw is here, so each state reads the same wherever a file shows.
 */
import { chooseFileKind, contentTypeForName, type FileFacts, type FileOpenAnswer, type RendererReport } from '@agenthix/core'
import { sizeLabel } from '../projects/fileListing'
import { extensionOf, fileKindLabel } from './kindLabel'
import type { RendererRegistry } from './registry'
import type { Renderer } from './renderer'

/** The eight states of the table, by number, and the two answers outside it. */
export type FrameStateId =
  | 'no-renderer'        // 1
  | 'too-large'          // 3
  | 'not-text'           // 4
  | 'no-files-address'   // 5
  | 'changed'            // 6
  | 'relay-unavailable'  // 7
  | 'site-unavailable'   // 8
  | 'no-relay'
  | 'not-found'
  | 'empty'
  | 'linked'

export type FrameOffer = 'download' | 'try-again' | 'show-new-version' | 'ask-the-agent'

export interface FrameNotice {
  state: FrameStateId
  words: string
  offer?: FrameOffer
}

export type FrameView =
  | { phase: 'opening' }
  | { phase: 'render'; facts: FileFacts; previewLink: string; downloadLink: string; renderer: Renderer }
  | { phase: 'notice'; facts?: FileFacts; downloadLink?: string; notice: FrameNotice }

export const SITE_UNAVAILABLE_WORDS = "The site holding these files isn't answering."
export const CHANGED_WORDS = 'This file changed since you opened it.'
export const EMPTY_WORDS = 'This file is empty.'
export const LINKED_WORDS =
  "This file can't be opened. It's linked to another file elsewhere on the machine, so Agenthix can't be sure it's safe to show you. Ask the agent to save it again as an ordinary copy."
export const NOT_TEXT_WORDS = "This doesn't look like text, so it isn't shown."

/** A file its renderer could not read, worded by what it was meant to be: a picture or a PDF is not text. */
function unreadableWords(facts: FileFacts): string {
  if (facts.kind === 'image') return "This image can't be drawn, so it isn't shown."
  if (facts.kind === 'pdf') return "This PDF can't be read, so it isn't shown."
  return NOT_TEXT_WORDS
}

const siteToUpgrade = (siteName: string) =>
  `${siteName} can't show a past version of a file until it is upgraded. An admin can upgrade it to the newest release.`
const relayUnavailable = (siteName: string, relayName: string) =>
  `Files on ${siteName} can't be opened right now: ${relayName} isn't answering.`

/** A name that claims a text kind: a binary file under it isn't what it says. */
function nameClaimsText(name: string): boolean {
  return chooseFileKind(name, true).kind !== 'text' || contentTypeForName(name) !== 'application/octet-stream'
}

function noRendererNotice(facts: FileFacts): FrameNotice {
  if (facts.kind === 'none' && nameClaimsText(facts.name)) return { state: 'not-text', words: NOT_TEXT_WORDS, offer: 'download' }
  const ext = extensionOf(facts.name)
  return { state: 'no-renderer', words: ext ? `No preview for .${ext} files.` : 'No preview for this kind of file.', offer: 'download' }
}

export function viewOfAnswer(answer: FileOpenAnswer | undefined, registry: RendererRegistry): FrameView {
  if (!answer) return { phase: 'opening' }
  switch (answer.state) {
    case 'ready': {
      const { facts, previewLink, downloadLink } = answer
      const renderer = registry.find(facts.kind)
      if (!renderer) return { phase: 'notice', facts, downloadLink, notice: noRendererNotice(facts) }
      return { phase: 'render', facts, previewLink, downloadLink, renderer }
    }
    case 'no-files-address':
      return {
        phase: 'notice', facts: answer.facts, downloadLink: answer.downloadLink,
        notice: {
          state: 'no-files-address',
          words: `${fileKindLabel(answer.facts)} preview needs a files address. An admin can set one up.`,
          offer: 'download',
        },
      }
    case 'relay-unavailable':
      return { phase: 'notice', notice: { state: 'relay-unavailable', words: relayUnavailable(answer.siteName, answer.relayName), offer: 'try-again' } }
    case 'site-unavailable':
      return { phase: 'notice', notice: { state: 'site-unavailable', words: answer.upgrade ? siteToUpgrade(answer.upgrade.siteName) : SITE_UNAVAILABLE_WORDS, offer: 'try-again' } }
    case 'no-relay':
      return {
        phase: 'notice',
        notice: {
          state: 'no-relay',
          words: `Files on ${answer.siteName} can't be opened yet: the site has no relay yet.`,
          offer: 'try-again',
        },
      }
    case 'linked':
      return { phase: 'notice', notice: { state: 'linked', words: LINKED_WORDS, offer: 'ask-the-agent' } }
    case 'not-found':
      return { phase: 'notice', notice: { state: 'not-found', words: "This file isn't there, or it isn't yours to open." } }
  }
}

/** An empty file says so in the preview's place: a preview with nothing in it reads as one that failed. */
export function emptyNotice(facts: FileFacts): FrameNotice | null {
  return facts.size === 0 ? { state: 'empty', words: EMPTY_WORDS } : null
}

/** A failed report in words, in the renderer's place. A ready or partial report has none. */
export function noticeOfReport(report: RendererReport | undefined, facts: FileFacts): FrameNotice | null {
  if (report?.state !== 'failed') return null
  switch (report.reason) {
    case 'unreadable': return { state: 'not-text', words: unreadableWords(facts), offer: 'download' }
    case 'too-large': return { state: 'too-large', words: `Too large to preview (${sizeLabel(facts.size)}).`, offer: 'download' }
    case 'changed': return { state: 'changed', words: CHANGED_WORDS, offer: 'show-new-version' }
    // The answer that opened it named no site or relay; Try again opens it afresh, which names them if it still fails.
    case 'unavailable': return { state: 'relay-unavailable', words: "This file can't be read right now: its relay isn't answering.", offer: 'try-again' }
  }
}

/**
 * The line above a renderer that shows only part of the file, worded the same for every kind: "Showing the first 1 MB
 * of 3.4 MB. Download to see all of it." A renderer may give its own first sentence ("the first 10,000 of 60,000 rows").
 * It points at the header's Download, which is the file's one.
 */
export function partialWords(report: RendererReport | undefined, facts: FileFacts): string | null {
  if (report?.state !== 'partial') return null
  return report.words ?? `Showing the first ${sizeLabel(report.shown)} of ${sizeLabel(facts.size)}. Download to see all of it.`
}

/** Download is greyed only when no byte can be fetched: the relay or the site isn't answering, or there is no link. */
export function canDownload(view: FrameView, notice: FrameNotice | null): boolean {
  if (view.phase === 'opening' || !view.downloadLink) return false
  return notice?.state !== 'relay-unavailable' && notice?.state !== 'site-unavailable'
}

/** The facts line: when it changed (and by whom), the kind, the size, and the kind's own fact. */
export function factsLine(facts: FileFacts | undefined, changed?: string, kindFact?: string): string {
  if (!facts) return changed ?? ''
  return [changed, fileKindLabel(facts), sizeLabel(facts.size), kindFact].filter(Boolean).join(' · ')
}
