/**
 * A seeded random source for filling a recipe once, when a picture is first made. The same seed gives the same
 * recipe; the recipe then names every choice, so the seed is not kept.
 */

export type Rng = () => number

function hashSeed(seed: string | number): number {
  const text = String(seed)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small, fast and well spread, which is all a picture needs. */
export function seededRng(seed: string | number): Rng {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('Nothing to pick from')
  return items[Math.floor(rng() * items.length)]
}

/** An integer in [min, max]. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** A fresh seed for a picture nobody asked to be repeatable. */
export function freshSeed(): string {
  return `${Date.now()}-${Math.random()}`
}
