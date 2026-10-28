/**
 * Publisher names (spec part 2 *Identity*, part 3 *Who signs*): the segment before the slash in every identity. A
 * name is a slug, `agenthix` and `unsigned` are reserved, and one name belongs to one signer for good. Pure.
 */
import { isAssetName, isReservedPublisher, ASSET_NAME_MAX_LENGTH } from '@agenthix/core'
import type { SignerIdentity } from './signing/types'

export function slugOf(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, ASSET_NAME_MAX_LENGTH).replace(/-+$/, '')
}

/** A name to offer when trusting a new signer: the repository's owner, the key, or the person's address. */
export function suggestedPublisherName(signer: SignerIdentity): string {
  let base = ''
  if (signer.kind === 'key') base = `key-${signer.keyId.slice(0, 12)}`
  else if (signer.repository) {
    const segments = signer.repository.replace(/^[a-z]+:\/\//, '').split('/').filter(Boolean)
    base = segments.length >= 3 ? segments[segments.length - 2] : segments[0] ?? ''
  } else base = signer.identity.split('@')[0] ?? ''
  const slug = slugOf(base)
  return isAssetName(slug) && !isReservedPublisher(slug) ? slug : 'publisher'
}

/** Why a name can't be a trusted publisher's, or null when it can. `taken` holds names already in use. */
export function publisherNameProblem(name: string, taken: { organisation: string | null; publishers: string[] }): string | null {
  if (!isAssetName(name)) return `“${name}” can't name a publisher: use 1 to 64 lowercase letters, digits and single hyphens.`
  if (isReservedPublisher(name)) return `“${name}” is reserved and can't name another publisher.`
  if (name === taken.organisation) return `“${name}” is this organisation's own name for what it makes.`
  if (taken.publishers.includes(name)) return `“${name}” already names another publisher.`
  return null
}
