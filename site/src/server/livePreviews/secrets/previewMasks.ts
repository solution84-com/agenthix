/**
 * How a live preview's lines are masked once a workflow handed it secrets (`handedSecrets.ts`): every line of its
 * apps and installs the site sends on, to hq and to the agent, passes through the mask the hand-off set. This module
 * holds only those functions, by live preview, and reaches nothing of the executor, so the agent's routes that send
 * those lines on reach no masking material and no value.
 */
import type { AppRun, AppStatus } from '@agenthix/core'

/** Masks a live preview's text against the secrets handed to it. */
export type PreviewMask = (text: string) => Promise<string>

const masks = new Map<string, PreviewMask>()

/**
 * A new hand-off adds to the mask rather than replacing it, for the life of the live preview: lines held from an earlier
 * run are masked when they are read, and a value handed before must stay masked in them.
 */
export function setPreviewMask(id: string, mask: PreviewMask): void {
  const earlier = masks.get(id)
  masks.set(id, earlier ? async text => mask(await earlier(text)) : mask)
}

/**
 * The mask as it stands now; null when nothing was handed. Taken when the lines are, so a stop that forgets it
 * afterwards cannot unmask what was told before it.
 */
export function previewMask(id: string): PreviewMask | null {
  return masks.get(id) ?? null
}

/** `text` masked against the secrets handed to the live preview, when any were; as it is otherwise. */
export async function maskPreviewText(id: string, text: string): Promise<string> {
  const mask = previewMask(id)
  return mask ? mask(text) : text
}

/** Lines are masked joined, so a secret spread over two lines is masked too. */
async function maskLines(mask: PreviewMask | null, lines: string[]): Promise<string[]> {
  return mask && lines.length ? (await mask(lines.join('\n'))).split('\n') : lines
}

/** An app's state as it leaves the site, its lines masked; `mask` as taken when the state was. */
export async function maskAppStatus(app: AppStatus, mask: PreviewMask | null = previewMask(app.livePreviewId)): Promise<AppStatus> {
  return mask ? { ...app, lastLines: await maskLines(mask, app.lastLines) } : app
}

export async function maskAppRun(run: AppRun | null, mask: PreviewMask | null): Promise<AppRun | null> {
  return run && mask ? { ...run, lastLines: await maskLines(mask, run.lastLines) } : run
}

/** The live preview stopped: its container, and the secrets in it, are gone. */
export function forgetPreviewMask(id: string): void {
  masks.delete(id)
}

export function resetPreviewMasksForTests(): void {
  masks.clear()
}
