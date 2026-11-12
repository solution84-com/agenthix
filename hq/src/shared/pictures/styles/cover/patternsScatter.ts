/** The cover patterns made of scattered pieces. Each draws white shapes on a 300 × 100 cover from a seeded source. */
import type { Rng } from '../../random'

const W = 'white'
const n = (v: number) => Number(v.toFixed(2))

export function circles(r: Rng): string {
  return Array.from({ length: 5 }, () => `<circle cx="${n(r() * 300)}" cy="${n(r() * 100)}" r="${n(25 + r() * 45)}" fill="${W}" opacity="0.12"/>`).join('')
}

export function confetti(r: Rng): string {
  return Array.from({ length: 45 }, () => {
    const x = r() * 300, y = r() * 100, w = 3 + r() * 5, h = 2 + r() * 3, a = r() * 180, cx = r() * 300, cy = r() * 100
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="1" fill="${W}" opacity="${(0.15 + r() * 0.3).toFixed(2)}" transform="rotate(${n(a)} ${n(cx)} ${n(cy)})"/>`
  }).join('')
}

export function squares(r: Rng): string {
  return Array.from({ length: 14 }, () => {
    const x = r() * 300, y = r() * 100, z = 10 + r() * 30
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(z)}" height="${n(z)}" fill="none" stroke="${W}" stroke-opacity="0.22" stroke-width="1.5" transform="rotate(${n(r() * 90)} ${n(x + z / 2)} ${n(y + z / 2)})"/>`
  }).join('')
}

export function triangles(r: Rng): string {
  let o = ''
  const s = 25
  for (let x = 0; x < 300; x += s) {
    for (let y = 0; y < 100; y += s) {
      o += `<polygon points="${x},${y} ${x + s},${y} ${x},${y + s}" fill="${W}" opacity="${(r() * 0.16).toFixed(3)}"/><polygon points="${x + s},${y} ${x + s},${y + s} ${x},${y + s}" fill="${W}" opacity="${(r() * 0.16).toFixed(3)}"/>`
    }
  }
  return o
}

export function dots(r: Rng): string {
  const g = 10 + Math.floor(r() * 8)
  let o = ''
  for (let x = g / 2; x < 300; x += g) for (let y = g / 2; y < 100; y += g) o += `<circle cx="${x}" cy="${y}" r="1.4" fill="${W}" opacity="0.3"/>`
  return o
}

export function sunburst(r: Rng): string {
  const cx = r() < 0.5 ? 0 : 300
  const cy = r() * 100
  let o = ''
  for (let i = 0; i < 36; i += 2) {
    const a1 = (i * Math.PI) / 18, a2 = ((i + 1) * Math.PI) / 18
    o += `<polygon points="${cx},${n(cy)} ${n(cx + Math.cos(a1) * 400)},${n(cy + Math.sin(a1) * 400)} ${n(cx + Math.cos(a2) * 400)},${n(cy + Math.sin(a2) * 400)}" fill="${W}" opacity="0.08"/>`
  }
  return o
}

/** Soft blurred ellipses in the cover's own two colours (hex, from the palette) and one white. */
export function blobs(r: Rng, first: string, second: string): string {
  const id = 'blur'
  const ellipses = Array.from({ length: 4 }, (_, i) =>
    `<ellipse cx="${n(r() * 300)}" cy="${n(r() * 100)}" rx="${n(50 + r() * 60)}" ry="${n(30 + r() * 30)}" fill="#${i % 2 ? first : second}" opacity="0.8"/>`,
  ).join('')
  return `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs><g filter="url(#${id})">${ellipses}<ellipse cx="${n(r() * 300)}" cy="${n(r() * 100)}" rx="60" ry="30" fill="${W}" opacity="0.25"/></g>`
}
