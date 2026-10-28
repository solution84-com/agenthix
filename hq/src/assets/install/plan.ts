/**
 * What installing a package would do, asset by asset, before it does anything (spec part 2 *De-duplication on
 * install*, I3 and I6). Identities match on kind, publisher and name together. The same version is reused; a newer one
 * is offered as an update, never applied by itself; an older one leaves the installed one alone. A version already
 * here with other content, an asset another signer published, and a built-in's identity are refused. Pure.
 * Agenthix's identity is exempt from the signer comparison: it is only ever taken from hq's
 * image or Agenthix's own signature (`decide.ts`), which are the same publisher.
 */
import { AGENTHIX_PUBLISHER, compareSemVer, formatAssetIdentity, type AssetKind } from '@agenthix/core'

export type ExistingVersion = { version: string; digest: string; signerIdentity: string | null }

export type ExistingAsset = {
  id: string
  builtIn: boolean
  removed: boolean
  current: ExistingVersion | null
  versions: ExistingVersion[]
}

export type AssetLookup = (kind: AssetKind, publisher: string, name: string) => Promise<ExistingAsset | null>

/** new: not here; restore: removed from the Library, brought back; same: this version is the one in use; update: newer, offered; older: yours is newer. */
export type ItemOutcome = 'new' | 'restore' | 'same' | 'update' | 'older' | 'refused'

export type PlanItem = {
  kind: AssetKind
  identity: string
  publisher: string
  name: string
  title: string
  version: string
  fingerprint: string
  outcome: ItemOutcome
  /** The version in use here, when there is one. */
  installedVersion: string | null
  /** True when this exact version is already held, so nothing new is stored. */
  held: boolean
  existingId: string | null
  /** Why it is refused. */
  reason: string | null
}

export type PlanInput = { kind: AssetKind; name: string; title: string; version: string; fingerprint: string }

export function classify(existing: ExistingAsset | null, input: PlanInput, publisher: string, signerIdentity: string | null): PlanItem {
  const identity = formatAssetIdentity({ publisher, name: input.name })
  const item: PlanItem = {
    ...input, identity, publisher, outcome: 'new', installedVersion: existing?.current?.version ?? null,
    held: false, existingId: existing?.id ?? null, reason: null,
  }
  const refuse = (reason: string): PlanItem => ({ ...item, outcome: 'refused', reason })
  if (!existing) return item
  if (existing.builtIn) return refuse(`${identity} is built into hq and can't be installed over.`)
  if (publisher !== AGENTHIX_PUBLISHER && existing.versions.some(v => v.signerIdentity !== signerIdentity)) {
    return refuse(`${identity} here was signed by someone else, and a different signer is always a different asset.`)
  }
  const same = existing.versions.find(v => v.version === input.version)
  if (same && same.digest !== input.fingerprint) {
    return refuse(`${identity} ${input.version} is already here with different content, and a released version never changes.`)
  }
  const held = same !== undefined
  if (existing.removed) return { ...item, outcome: 'restore', held }
  if (!existing.current) return refuse(`${identity} is being written here and has no version yet.`)
  if (existing.current.version === input.version) return { ...item, outcome: 'same', held }
  return { ...item, outcome: compareSemVer(input.version, existing.current.version) > 0 ? 'update' : 'older', held }
}

export function itemLine(item: PlanItem): string {
  switch (item.outcome) {
    case 'new': return `Installs ${item.title} ${item.version} as ${item.identity}.`
    case 'restore': return `${item.title} was removed from the Library; installing brings it back at ${item.version}.`
    case 'same': return `${item.title} ${item.version} is already installed. There is nothing new to install.`
    case 'update': return `${item.title} ${item.version} is newer than yours (${item.installedVersion}). Installing offers it as an update, which you accept on its page.`
    case 'older': return `You have a newer ${item.title} (${item.installedVersion}). Installing changes nothing.`
    case 'refused': return item.reason ?? `${item.identity} can't be installed.`
  }
}

/** I6: "This template brings 7 skills: 5 for its role, 1 you already have, 1 newer than yours, update offered." */
export function summarise(main: PlanItem, embedded: PlanItem[]): string {
  if (embedded.length === 0) return itemLine(main)
  const role = embedded.filter(e => e.name.includes('/') && e.outcome !== 'refused')
  const shared = embedded.filter(e => !role.includes(e))
  const count = (o: ItemOutcome) => shared.filter(e => e.outcome === o).length
  const parts = [
    role.length ? `${role.length} for its role` : null,
    count('new') + count('restore') ? `${count('new') + count('restore')} new` : null,
    count('same') ? `${count('same')} you already have` : null,
    count('update') ? `${count('update')} newer than yours, update offered` : null,
    count('older') ? `${count('older')} older than yours, yours kept` : null,
    count('refused') ? `${count('refused')} refused` : null,
  ].filter(Boolean)
  const skills = `${embedded.length} skill${embedded.length === 1 ? '' : 's'}`
  return `This ${main.kind === 'team' ? 'team template' : `${main.kind} template`} brings ${skills}: ${parts.join(', ')}.`
}
