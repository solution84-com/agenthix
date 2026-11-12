/** The cover patterns made of lines and curves, on a 300 × 100 cover, from a seeded source. */
import type { Rng } from '../../random'

const W = 'white'

export function waves(r: Rng): string {
  const ph = r() * 60
  return [0, 1, 2, 3, 4]
    .map((i) => `<path d="M${-ph} ${20 + i * 18} Q ${75 - ph} ${i * 18} ${150 - ph} ${20 + i * 18} T ${300 - ph} ${20 + i * 18} T ${450 - ph} ${20 + i * 18}" stroke="${W}" stroke-opacity="0.2" stroke-width="2" fill="none"/>`)
    .join('')
}

export function stripes(r: Rng): string {
  const g = 10 + Math.floor(r() * 12)
  let o = ''
  for (let x = -120; x < 320; x += g) o += `<line x1="${x}" y1="100" x2="${x + 100}" y2="0" stroke="${W}" stroke-opacity="0.14" stroke-width="${g / 3}"/>`
  return o
}

export function grid(r: Rng): string {
  const g = 14 + Math.floor(r() * 14)
  let o = ''
  for (let x = 0; x < 300; x += g) o += `<line x1="${x}" y1="0" x2="${x}" y2="100" stroke="${W}" stroke-opacity="0.15"/>`
  for (let y = 0; y < 100; y += g) o += `<line x1="0" y1="${y}" x2="300" y2="${y}" stroke="${W}" stroke-opacity="0.15"/>`
  return o
}

export function rings(r: Rng): string {
  const cx = (r() * 300).toFixed(2), cy = (r() * 100).toFixed(2)
  return Array.from({ length: 22 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${8 + i * 14}" fill="none" stroke="${W}" stroke-opacity="0.16" stroke-width="1.5"/>`).join('')
}

export function topography(r: Rng): string {
  const a = 4 + r() * 8, f = 0.015 + r() * 0.02, ph = r() * 6
  let o = ''
  for (let i = -2; i < 14; i++) {
    let d = ''
    for (let x = 0; x <= 300; x += 6) {
      const y = i * 8 + Math.sin(x * f + ph + i * 0.35) * a + Math.sin(x * f * 2.3 + i) * a * 0.4
      d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1)
    }
    o += `<path d="${d}" fill="none" stroke="${W}" stroke-opacity="0.18" stroke-width="1"/>`
  }
  return o
}

export function zigzag(r: Rng): string {
  const h = 8 + r() * 6, w = 12 + r() * 8
  let o = ''
  for (let y = 0; y < 110; y += h * 2) {
    let d = `M0 ${y.toFixed(2)}`
    for (let x = 0; x <= 300; x += w) d += ` L${(x + w / 2).toFixed(2)} ${(y + h).toFixed(2)} L${(x + w).toFixed(2)} ${y.toFixed(2)}`
    o += `<path d="${d}" fill="none" stroke="${W}" stroke-opacity="0.18" stroke-width="2"/>`
  }
  return o
}
