/** The thirteen patterns of the cover generator, by name; `none` is a plain blend. */
import type { Rng } from '../../random'
import { blobs, circles, confetti, dots, squares, sunburst, triangles } from './patternsScatter'
import { grid, rings, stripes, topography, waves, zigzag } from './patternsLines'

export const COVER_PATTERNS = [
  'none', 'circles', 'waves', 'dots', 'stripes', 'grid', 'rings', 'triangles', 'topography', 'blobs', 'confetti',
  'zigzag', 'squares', 'sunburst',
] as const
export type CoverPattern = (typeof COVER_PATTERNS)[number]

export function isCoverPattern(value: unknown): value is CoverPattern {
  return typeof value === 'string' && (COVER_PATTERNS as readonly string[]).includes(value)
}

/** The pattern's drawing, as SVG elements on a 300 × 100 cover. `first` and `second` are the cover's hex colours. */
export function patternSvg(pattern: CoverPattern, r: Rng, first: string, second: string): string {
  switch (pattern) {
    case 'circles': return circles(r)
    case 'waves': return waves(r)
    case 'dots': return dots(r)
    case 'stripes': return stripes(r)
    case 'grid': return grid(r)
    case 'rings': return rings(r)
    case 'triangles': return triangles(r)
    case 'topography': return topography(r)
    case 'blobs': return blobs(r, first, second)
    case 'confetti': return confetti(r)
    case 'zigzag': return zigzag(r)
    case 'squares': return squares(r)
    case 'sunburst': return sunburst(r)
    case 'none': return ''
  }
}
