/** Zoom and page position, apart from the page so they can be tested. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
const ZOOM_STEPS = [0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]

const clamp = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))

/** The scale at which a page `pageWidth` points wide fills `available` pixels, less a gutter on each side. */
export function fitWidthScale(pageWidth: number, available: number, gutter: number): number {
  return clamp((available - 2 * gutter) / pageWidth)
}

export function nextZoom(current: number, direction: 'in' | 'out'): number {
  const step = direction === 'in'
    ? ZOOM_STEPS.find(s => s > current + 0.001)
    : [...ZOOM_STEPS].reverse().find(s => s < current - 0.001)
  return step ?? (direction === 'in' ? ZOOM_MAX : ZOOM_MIN)
}

/** The page (from 1) whose top is the last at or above `scrollTop`, given each page's top. */
export function pageAt(tops: readonly number[], scrollTop: number): number {
  let page = 1
  for (let i = 0; i < tops.length; i++) if (tops[i] <= scrollTop + 1) page = i + 1
  return page
}
