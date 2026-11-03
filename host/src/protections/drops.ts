/**
 * What the live-preview rules dropped, by address, read from their counting sets in `nft -j list table inet <table>`
 * (`drops_<rule>`): one counter per address since the rules were last applied. The site's guard works rates out of
 * two readings.
 */
import type { ProtectionDrop, ProtectionRule } from '@agenthix/core'
import { dropSetFor, rulesFor, type RuleSet } from './rules'

type NftSet = { table?: string; name?: string; elem?: unknown[] }

const ADDRESS = /^[0-9.]{7,15}$/

function counted(e: unknown): { source: string; dropped: number } | null {
  const inner = (e as { elem?: { val?: unknown; counter?: { packets?: unknown } } } | null)?.elem
  if (!inner || typeof inner.val !== 'string' || !ADDRESS.test(inner.val)) return null
  const packets = inner.counter?.packets
  return typeof packets === 'number' && Number.isSafeInteger(packets) && packets >= 0 ? { source: inner.val, dropped: packets } : null
}

export function dropsIn(listing: string, rules: RuleSet): ProtectionDrop[] {
  let items: { set?: NftSet }[]
  try {
    items = (JSON.parse(listing) as { nftables?: { set?: NftSet }[] }).nftables ?? []
  } catch {
    return []
  }
  const byName = new Map<string, ProtectionRule>(rulesFor(rules).map(r => [dropSetFor(r), r]))
  const out: ProtectionDrop[] = []
  for (const { set } of items) {
    const rule = set && set.table === rules.table && typeof set.name === 'string' ? byName.get(set.name) : undefined
    if (!rule || !Array.isArray(set!.elem)) continue
    for (const e of set!.elem) {
      const c = counted(e)
      if (c && c.dropped > 0) out.push({ rule, ...c })
    }
  }
  return out
}
