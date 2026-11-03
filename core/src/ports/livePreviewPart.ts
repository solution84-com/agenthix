/**
 * The live-preview part of an agent range: its last /LIVE_PREVIEW_PART_BITS, which for an installation's agent slice
 * (a /AGENT_SLICE_BITS) is its upper half. The site allocates every live preview's networks there and nowhere else; the
 * host service writes the live-preview rules for exactly this block. Both compute it from the same range, so they agree.
 */
import { LIVE_PREVIEW_PART_BITS } from './ports.js'

function parse(cidr: string): { start: number; bits: number } | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr.trim())
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  const bits = Number(m[5])
  if (parts.some(p => p > 255) || bits > 32) return null
  const start = parts.reduce((n, p) => n * 256 + p, 0)
  return start % 2 ** (32 - bits) === 0 ? { start, bits } : null
}

const dotted = (n: number) => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.')

/**
 * The live-preview part of `range` (an IPv4 CIDR on its own boundary), or null when it is not one, or smaller than a
 * live-preview part.
 */
export function livePreviewPartOf(range: string): string | null {
  const r = parse(range)
  if (!r || r.bits > LIVE_PREVIEW_PART_BITS) return null
  const start = r.start + 2 ** (32 - r.bits) - 2 ** (32 - LIVE_PREVIEW_PART_BITS)
  return `${dotted(start)}/${LIVE_PREVIEW_PART_BITS}`
}
