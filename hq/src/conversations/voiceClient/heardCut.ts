/**
 * The last reply voice stopped — spoken over, or the call ended during it — frozen where the person stopped hearing
 * it. Its text shows only that far, during the call and after it, until its record holds the cut: hq cuts the
 * stored reply to the same word (`heardEnd`), and a message marked interrupted is that cut. A turn that completes or
 * fails after it was stopped was not cut by hq (it was not a reply voice spoke), and shows whole again.
 *
 * Kept outside the voice session's snapshot because it outlives the call, and the thread reads it without the
 * call's provider.
 */
import { useSyncExternalStore } from 'react'
import { revealedChars } from './reveal'
import type { Reveal } from './voiceSnapshot'

let cut: Reveal | null = null
const listeners = new Set<() => void>()

export function heardCut(): Reveal | null {
  return cut
}

export function setHeardCut(next: Reveal | null): void {
  if (next === cut) return
  cut = next
  listeners.forEach(l => l())
}

/** A turn ended: one that completed or failed after voice stopped it was not cut by hq, and shows whole again. */
export function turnEnded(turnId: string, state: string): void {
  if (cut?.turnId === turnId && (state === 'COMPLETED' || state === 'FAILED')) setHeardCut(null)
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useHeardCut(): Reveal | null {
  return useSyncExternalStore(subscribe, heardCut, () => null)
}

/** How much of a reply's `text` may show under the cut: null when the cut is not this reply's, or the record holds it. */
export function cutLimit(at: Reveal | null, turnId: string | null | undefined, text: string, interrupted = false): number | null {
  if (!at || !turnId || at.turnId !== turnId || interrupted) return null
  return revealedChars(text, at.sentences, at.head)
}
